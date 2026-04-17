import time
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import AsyncClient

from app.core.budget import cost_guard
from app.core.config import settings
from app.core.dependencies import get_firestore
from app.core.security import get_current_user
from app.models.photos import (
    LabelRequest,
    LabelResponse,
    SignedUrlRequest,
    SignedUrlResponse,
)
from app.services.storage import generate_signed_upload_url
from app.services.vision import VisionAPIError, detect_labels_gcs

logger = structlog.get_logger()

router = APIRouter(prefix="/photos", tags=["photos"])


@router.post("/upload-url", response_model=SignedUrlResponse)
async def get_upload_url(
    body: SignedUrlRequest,
    _user: dict[str, Any] = Depends(get_current_user),
) -> SignedUrlResponse:
    """Generate a signed URL for direct upload to GCS."""
    bucket = f"{settings.gcp_project_id}.appspot.com"
    url, gcs_uri = await generate_signed_upload_url(
        bucket, body.event_id, body.filename, body.content_type,
    )
    return SignedUrlResponse(upload_url=url, gcs_uri=gcs_uri)


@router.post("/label", response_model=LabelResponse)
async def label_photo(
    body: LabelRequest,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncClient = Depends(get_firestore),
) -> LabelResponse:
    """Run Vision API label detection on an uploaded photo, save to Firestore."""
    if not cost_guard.check_vision():
        raise HTTPException(status_code=429, detail="Vision API daily limit reached")

    try:
        labels = await detect_labels_gcs(body.gcs_uri, max_results=8)
    except VisionAPIError as exc:
        raise HTTPException(status_code=502, detail="Vision API error") from exc

    doc_ref = (
        db.collection("events").document(body.event_id).collection("photos").document()
    )
    await doc_ref.set({
        "gcsUri": body.gcs_uri,
        "labels": labels,
        "uploadedBy": user.get("uid", ""),
        "timestamp": int(time.time() * 1000),
    })

    return LabelResponse(labels=labels, photo_id=doc_ref.id)
