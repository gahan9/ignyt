import asyncio
import uuid
from datetime import timedelta

import structlog
from google.cloud import storage

from app.core.config import settings

logger = structlog.get_logger()

_client: storage.Client | None = None


def _get_client() -> storage.Client:
    global _client
    if _client is None:
        _client = storage.Client(project=settings.gcp_project_id)
    return _client


def _blocking_signed_url(
    bucket_name: str,
    event_id: str,
    filename: str,
    content_type: str,
) -> tuple[str, str]:
    client = _get_client()
    bucket = client.bucket(bucket_name)

    unique_name = f"events/{event_id}/photos/{uuid.uuid4().hex}_{filename}"
    blob = bucket.blob(unique_name)

    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="PUT",
        content_type=content_type,
    )

    gcs_uri = f"gs://{bucket_name}/{unique_name}"
    return url, gcs_uri


async def generate_signed_upload_url(
    bucket_name: str,
    event_id: str,
    filename: str,
    content_type: str = "image/jpeg",
) -> tuple[str, str]:
    """Generate a V4 signed URL for direct browser-to-GCS upload.

    Returns ``(signed_url, gcs_uri)``. The blocking SDK call is run in a
    worker thread so the event loop is not stalled under concurrency.
    """
    url, gcs_uri = await asyncio.to_thread(
        _blocking_signed_url, bucket_name, event_id, filename, content_type
    )
    logger.info("signed_url_generated", gcs_uri=gcs_uri)
    return url, gcs_uri
