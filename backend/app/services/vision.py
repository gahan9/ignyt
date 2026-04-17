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


async def extract_badge_text(image_base64: str) -> list[str]:
    """Run OCR on a badge image, returning detected text lines.

    Checks CostGuard before calling the Vision API.
    Returns empty list if budget exhausted or on error.
    """
    if not cost_guard.check_vision():
        logger.warning("vision_budget_exhausted")
        return []

    try:
        image_bytes = base64.b64decode(image_base64)
        image = vision.Image(content=image_bytes)

        client = _get_client()
        response = client.text_detection(image=image)
        cost_guard.record_vision()

        if response.error.message:
            logger.error("vision_api_error", error=response.error.message)
            return []

        texts = [
            annotation.description
            for annotation in response.text_annotations
        ]
        logger.info("badge_ocr_complete", text_count=len(texts))
        return texts

    except Exception as exc:
        logger.error("badge_ocr_failed", error=str(exc))
        return []
