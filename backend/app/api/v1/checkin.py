from typing import Any

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
from app.repositories.attendee_repo import (
    find_attendee_by_name,
    get_attendee,
    mark_checked_in,
)
from app.services.vision import extract_badge_text

router = APIRouter(prefix="/checkin", tags=["checkin"])


@router.post("/scan", response_model=CheckInResponse)
async def scan_checkin(
    body: CheckInRequest,
    _user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_firestore),
) -> CheckInResponse:
    """Check in an attendee by ID (from QR code scan)."""
    attendee = await get_attendee(db, body.event_id, body.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    if attendee.get("checkedIn"):
        return CheckInResponse(
            attendee_id=attendee["id"],
            name=attendee.get("name", ""),
            checked_in=True,
            message="Already checked in",
        )

    await mark_checked_in(db, body.event_id, body.attendee_id)
    return CheckInResponse(
        attendee_id=attendee["id"],
        name=attendee.get("name", ""),
        checked_in=True,
        message="Check-in successful!",
    )


@router.post("/badge", response_model=BadgeOcrResponse)
async def badge_ocr(
    body: BadgeOcrRequest,
    _user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_firestore),
) -> BadgeOcrResponse:
    """Read a badge photo with Vision API OCR, attempt to match an attendee."""
    texts = await extract_badge_text(body.image_base64)
    if not texts:
        return BadgeOcrResponse(detected_text=[], matched_attendee=None)

    full_text = texts[0] if texts else ""
    lines = [line.strip() for line in full_text.split("\n") if line.strip()]

    matched = None
    confidence = 0.0
    for line in lines:
        attendee = await find_attendee_by_name(db, body.event_id, line)
        if attendee:
            matched = attendee["id"]
            confidence = 0.85
            await mark_checked_in(db, body.event_id, attendee["id"])
            break

    return BadgeOcrResponse(
        detected_text=lines,
        matched_attendee=matched,
        confidence=confidence,
    )
