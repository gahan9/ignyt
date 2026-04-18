"""Photo board endpoints: signed upload URLs and Vision label detection."""

from datetime import UTC, datetime
from typing import Any, Final

import structlog
from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import AsyncClient

from app.core.budget import cost_guard
from app.core.config import settings
from app.core.dependencies import get_firestore
from app.core.security import get_current_user
from app.models.common import ErrorResponse
from app.models.photos import (
    LabelRequest,
    LabelResponse,
    SignedUrlRequest,
    SignedUrlResponse,
)
from app.services.storage import generate_signed_upload_url
from app.services.vision import VisionAPIError, detect_labels_gcs

logger = structlog.get_logger()

LABEL_RESULT_LIMIT: Final[int] = 8
MILLIS_PER_SECOND: Final[int] = 1000

router = APIRouter(prefix="/photos", tags=["photos"])


@router.post(
    "/upload-url",
    response_model=SignedUrlResponse,
    summary="Get a signed URL for direct GCS upload",
    description=(
        "Returns a V4 signed URL that the client uploads the photo to "
        "directly (HTTP PUT) — no bytes flow through this API. The "
        "returned `gcs_uri` is passed back to `/photos/label` once the "
        "upload completes."
    ),
    responses={
        200: {
            "description": "Signed URL ready for upload.",
            "content": {
                "application/json": {
                    "example": {
                        "upload_url": (
                            "https://storage.googleapis.com/ignyt-photos/"
                            "events/demo-event/photos/<signed-params>"
                        ),
                        "gcs_uri": "gs://ignyt-photos/events/demo-event/photos/abc.jpg",
                    }
                }
            },
        },
        401: {"model": ErrorResponse, "description": "Missing or invalid token."},
    },
)
async def get_upload_url(
    body: SignedUrlRequest,
    _user: dict[str, Any] = Depends(get_current_user),
) -> SignedUrlResponse:
    """Generate a signed URL for direct upload to GCS."""
    bucket = f"{settings.gcp_project_id}.appspot.com"
    url, gcs_uri = await generate_signed_upload_url(
        bucket,
        body.event_id,
        body.filename,
        body.content_type,
    )
    return SignedUrlResponse(upload_url=url, gcs_uri=gcs_uri)


@router.post(
    "/label",
    response_model=LabelResponse,
    summary="Run Vision label detection and persist to Firestore",
    description=(
        "Invokes Cloud Vision `LABEL_DETECTION` on a GCS object and stores "
        "the top labels on a new Firestore `photos` document under the "
        "event. Counts against the daily Vision CostGuard limit."
    ),
    responses={
        200: {
            "description": "Labels detected and photo doc created.",
            "content": {
                "application/json": {
                    "example": {
                        "labels": ["Conference", "People", "Stage", "Indoor"],
                        "photo_id": "abc123XYZ",
                    }
                }
            },
        },
        401: {"model": ErrorResponse, "description": "Missing or invalid token."},
        429: {
            "model": ErrorResponse,
            "description": "Daily Vision budget exhausted; retry after UTC midnight.",
            "content": {
                "application/json": {"example": {"detail": "Vision API daily limit reached"}}
            },
        },
        502: {
            "model": ErrorResponse,
            "description": "Vision API upstream error.",
        },
    },
)
async def label_photo(
    body: LabelRequest,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_firestore),
) -> LabelResponse:
    """Run Vision API label detection on an uploaded photo, save to Firestore."""
    if not cost_guard.check_vision():
        raise HTTPException(status_code=429, detail="Vision API daily limit reached")

    try:
        labels = await detect_labels_gcs(body.gcs_uri, max_results=LABEL_RESULT_LIMIT)
    except VisionAPIError as exc:
        raise HTTPException(status_code=502, detail="Vision API error") from exc

    doc_ref = db.collection("events").document(body.event_id).collection("photos").document()
    await doc_ref.set(
        {
            "gcsUri": body.gcs_uri,
            "labels": labels,
            "uploadedBy": user.get("uid", ""),
            "timestamp": int(datetime.now(tz=UTC).timestamp() * MILLIS_PER_SECOND),
        }
    )

    return LabelResponse(labels=labels, photo_id=doc_ref.id)
