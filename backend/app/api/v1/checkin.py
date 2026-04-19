"""Check-in endpoints: QR scan and badge OCR."""

import asyncio
from typing import Any, Final

from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import AsyncClient

from app.core.dependencies import get_firestore
from app.core.security import get_current_user
from app.models.checkin import (
    BadgeOcrRequest,
    BadgeOcrResponse,
    CheckInRequest,
    CheckInResponse,
)
from app.models.common import ErrorResponse
from app.repositories.attendee_repo import (
    find_attendee_by_name,
    get_attendee,
    mark_checked_in,
)
from app.services.vision import extract_badge_text

# Heuristic confidence emitted on a successful prefix match. Will become a
# real fuzzy-match score once we add proper string-similarity ranking.
BADGE_MATCH_CONFIDENCE: Final[float] = 0.85
NO_MATCH_CONFIDENCE: Final[float] = 0.0

# Firestore field names — centralised so a schema rename is a one-line edit.
FIELD_CHECKED_IN: Final[str] = "checkedIn"
FIELD_NAME: Final[str] = "name"
FIELD_ID: Final[str] = "id"

router = APIRouter(prefix="/checkin", tags=["checkin"])


@router.post(
    "/scan",
    response_model=CheckInResponse,
    summary="Check in an attendee by ID",
    description=(
        "Flip an attendee's `checkedIn` flag to `true`. Called by the "
        "frontend after a successful QR-code scan or manual ID entry. "
        "Idempotent: if the attendee is already checked in, returns 200 "
        "with `message='Already checked in'` rather than erroring."
    ),
    responses={
        200: {
            "description": "Attendee checked in (or already was).",
            "content": {
                "application/json": {
                    "examples": {
                        "new_checkin": {
                            "summary": "First-time check-in",
                            "value": {
                                "attendee_id": "att-0001",
                                "name": "Alice Chen",
                                "checked_in": True,
                                "message": "Check-in successful!",
                            },
                        },
                        "already_checked_in": {
                            "summary": "Already checked in",
                            "value": {
                                "attendee_id": "att-0001",
                                "name": "Alice Chen",
                                "checked_in": True,
                                "message": "Already checked in",
                            },
                        },
                    }
                }
            },
        },
        401: {
            "model": ErrorResponse,
            "description": "Missing or invalid Firebase ID token.",
        },
        404: {
            "model": ErrorResponse,
            "description": "Attendee id does not exist under the given event.",
            "content": {"application/json": {"example": {"detail": "Attendee not found"}}},
        },
    },
)
async def scan_checkin(
    body: CheckInRequest,
    _user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_firestore),
) -> CheckInResponse:
    """Check in an attendee by ID (from QR code scan or manual entry)."""
    attendee = await get_attendee(db, body.event_id, body.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    if attendee.get(FIELD_CHECKED_IN):
        return CheckInResponse(
            attendee_id=attendee[FIELD_ID],
            name=attendee.get(FIELD_NAME, ""),
            checked_in=True,
            message="Already checked in",
        )

    await mark_checked_in(db, body.event_id, body.attendee_id)
    return CheckInResponse(
        attendee_id=attendee[FIELD_ID],
        name=attendee.get(FIELD_NAME, ""),
        checked_in=True,
        message="Check-in successful!",
    )


@router.post(
    "/badge",
    response_model=BadgeOcrResponse,
    summary="OCR a badge photo and check the attendee in",
    description=(
        "Submit a base64-encoded badge photo. The Vision API extracts text, "
        "and the server tries to match each line to an attendee's "
        "`name_lower` field via a Firestore prefix query. On a match, the "
        "attendee is automatically checked in.\n\n"
        "Returns the OCR'd lines even when no match is found so the client "
        "can prompt a human to pick from the list."
    ),
    responses={
        200: {
            "description": "OCR completed (match status reflected in body).",
            "content": {
                "application/json": {
                    "examples": {
                        "match": {
                            "summary": "Matched and checked in",
                            "value": {
                                "detected_text": ["Alice Chen", "Acme Corp"],
                                "matched_attendee": "att-0001",
                                "confidence": 0.85,
                            },
                        },
                        "no_match": {
                            "summary": "Text detected but no attendee matched",
                            "value": {
                                "detected_text": ["Unknown Person"],
                                "matched_attendee": None,
                                "confidence": 0.0,
                            },
                        },
                    }
                }
            },
        },
        401: {"model": ErrorResponse, "description": "Missing or invalid token."},
        413: {
            "model": ErrorResponse,
            "description": "Image base64 exceeds 2MB size cap.",
        },
        502: {
            "model": ErrorResponse,
            "description": "Vision API upstream error.",
        },
    },
)
async def badge_ocr(
    body: BadgeOcrRequest,
    _user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_firestore),
) -> BadgeOcrResponse:
    """Read a badge photo with Vision API OCR, attempt to match an attendee."""
    texts = await extract_badge_text(body.image_base64)
    if not texts:
        return BadgeOcrResponse(detected_text=[], matched_attendee=None)

    # Vision returns the full OCR'd text as the first annotation; subsequent
    # entries are per-line. Splitting [0] gives us logical badge lines.
    full_text = texts[0] if texts else ""
    lines = [line.strip() for line in full_text.split("\n") if line.strip()]

    # Fire all candidate-line lookups in parallel. A typical badge has 3-6
    # OCR'd lines, and ``find_attendee_by_name`` issues one Firestore query
    # each; serialising them adds round-trip latency that the user feels
    # while staring at the camera. Order is preserved so we still pick the
    # earliest line that matches (badges put the name on the first line).
    lookups = await asyncio.gather(
        *(find_attendee_by_name(db, body.event_id, line) for line in lines)
    )

    matched: str | None = None
    confidence = NO_MATCH_CONFIDENCE
    for attendee in lookups:
        if attendee:
            matched = attendee[FIELD_ID]
            confidence = BADGE_MATCH_CONFIDENCE
            await mark_checked_in(db, body.event_id, attendee[FIELD_ID])
            break

    return BadgeOcrResponse(
        detected_text=lines,
        matched_attendee=matched,
        confidence=confidence,
    )
