"""Cloud Storage signed-URL generation for direct browser uploads.

The signed URL pattern keeps photo bytes off the API process — clients
``PUT`` directly to GCS with a short-lived signature, then post the
resulting ``gs://`` URI back to the API for downstream processing.
"""

import asyncio
import uuid
from datetime import timedelta
from functools import lru_cache
from typing import Final

import structlog
from google.cloud import storage

from app.core.config import settings

logger = structlog.get_logger()

SIGNED_URL_TTL: Final[timedelta] = timedelta(minutes=15)
DEFAULT_CONTENT_TYPE: Final[str] = "image/jpeg"


@lru_cache(maxsize=1)
def _get_client() -> storage.Client:
    """Lazily instantiate (and memoise) the GCS SDK client.

    See ``app.services.vision._get_client`` for the rationale on
    preferring ``functools.lru_cache`` over a module-level singleton.
    """
    return storage.Client(project=settings.gcp_project_id)


def _blocking_signed_url(
    bucket_name: str,
    event_id: str,
    filename: str,
    content_type: str,
) -> tuple[str, str]:
    """Synchronous helper that produces the signed URL via the blocking SDK.

    Always invoked through :func:`asyncio.to_thread` from public callers.
    """
    client = _get_client()
    bucket = client.bucket(bucket_name)

    unique_name = f"events/{event_id}/photos/{uuid.uuid4().hex}_{filename}"
    blob = bucket.blob(unique_name)

    url = blob.generate_signed_url(
        version="v4",
        expiration=SIGNED_URL_TTL,
        method="PUT",
        content_type=content_type,
    )

    gcs_uri = f"gs://{bucket_name}/{unique_name}"
    return url, gcs_uri


async def generate_signed_upload_url(
    bucket_name: str,
    event_id: str,
    filename: str,
    content_type: str = DEFAULT_CONTENT_TYPE,
) -> tuple[str, str]:
    """Generate a V4 signed URL for direct browser-to-GCS upload.

    Args:
        bucket_name: Target GCS bucket name (no ``gs://`` prefix).
        event_id: Event id used to namespace the object path.
        filename: Caller-supplied filename. Prefixed with a UUID to
            guarantee uniqueness within the event's photos folder.
        content_type: MIME type the client will send in the ``PUT``
            request. Must match exactly or GCS will reject the upload.

    Returns:
        ``(signed_url, gcs_uri)`` — the URL the client uploads to, and
        the canonical ``gs://`` URI to pass to downstream processing.
    """
    url, gcs_uri = await asyncio.to_thread(
        _blocking_signed_url, bucket_name, event_id, filename, content_type
    )
    logger.info("signed_url_generated", gcs_uri=gcs_uri)
    return url, gcs_uri
