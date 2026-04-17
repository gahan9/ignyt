import asyncio
import base64

import structlog
from google.cloud import vision

from app.core.budget import cost_guard

logger = structlog.get_logger()

_client: vision.ImageAnnotatorClient | None = None


def _get_client() -> vision.ImageAnnotatorClient:
    global _client
    if _client is None:
        _client = vision.ImageAnnotatorClient()
    return _client


class VisionAPIError(Exception):
    """Raised when the Vision API returns an explicit error payload."""


async def extract_badge_text(image_base64: str) -> list[str]:
    """OCR a badge image. Returns detected text lines (empty on error/budget)."""
    if not cost_guard.check_vision():
        logger.warning("vision_budget_exhausted")
        return []

    try:
        image_bytes = base64.b64decode(image_base64)
        image = vision.Image(content=image_bytes)
        client = _get_client()

        response = await asyncio.to_thread(client.text_detection, image=image)
        cost_guard.record_vision()

        if response.error.message:
            logger.error("vision_api_error", error=response.error.message)
            return []

        texts = [annotation.description for annotation in response.text_annotations]
        logger.info("badge_ocr_complete", text_count=len(texts))
        return texts

    except Exception as exc:
        logger.error("badge_ocr_failed", error=str(exc))
        return []


async def detect_labels_gcs(gcs_uri: str, max_results: int = 8) -> list[str]:
    """Run label detection on a GCS-hosted image.

    Raises ``VisionAPIError`` when the API returns a non-transient error
    (so callers can surface 502). Returns an empty list for transient
    client-side failures (network, decode, etc.).
    """
    if not cost_guard.check_vision():
        logger.warning("vision_budget_exhausted")
        return []

    try:
        client = _get_client()
        image = vision.Image(source=vision.ImageSource(gcs_image_uri=gcs_uri))

        response = await asyncio.to_thread(
            client.label_detection, image=image, max_results=max_results
        )
        cost_guard.record_vision()

        if response.error.message:
            logger.error("vision_label_error", error=response.error.message)
            raise VisionAPIError(response.error.message)

        labels = [label.description for label in response.label_annotations]
        logger.info("vision_labels_detected", count=len(labels))
        return labels

    except VisionAPIError:
        raise
    except Exception as exc:
        logger.error("vision_label_failed", error=str(exc))
        return []
