"""Pydantic schemas for ``/api/v1/photos/*`` endpoints."""

from pydantic import BaseModel, Field


class SignedUrlRequest(BaseModel):
    """Payload for `POST /api/v1/photos/upload-url`."""

    event_id: str = Field(description="Firestore event id.", examples=["demo-event"])
    filename: str = Field(
        description=(
            "Original filename from the client. Used as the object name "
            "under `events/{event_id}/photos/` — make it unique (e.g. "
            "prefix with a UUID) to avoid GCS overwrites."
        ),
        examples=["crowd-shot-42.jpg"],
    )
    content_type: str = Field(
        default="image/jpeg",
        description="MIME type sent in the Content-Type header of the upload.",
        examples=["image/jpeg", "image/png"],
    )


class SignedUrlResponse(BaseModel):
    """Signed URL returned to the client for direct GCS upload."""

    upload_url: str = Field(
        description="V4 signed PUT URL. Expires in 15 minutes.",
    )
    gcs_uri: str = Field(
        description=(
            "`gs://` URI the client passes back to `/photos/label` once the PUT upload completes."
        ),
    )


class LabelRequest(BaseModel):
    """Payload for `POST /api/v1/photos/label`."""

    event_id: str = Field(description="Firestore event id.", examples=["demo-event"])
    gcs_uri: str = Field(
        description="GCS URI of the uploaded photo (from `SignedUrlResponse`).",
        examples=["gs://ignyt-photos/events/demo-event/photos/crowd-shot-42.jpg"],
    )


class LabelResponse(BaseModel):
    """Vision label detection result."""

    labels: list[str] = Field(
        description="Up to 8 top labels, ranked by confidence.",
    )
    photo_id: str = Field(
        description="Firestore document id the photo metadata was written to.",
    )
