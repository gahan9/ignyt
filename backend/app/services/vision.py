"""Cloud Vision wrappers: badge OCR and image label detection.

All blocking SDK calls are dispatched via ``asyncio.to_thread`` so the
event loop stays free under concurrency. Every call counts against the
daily ``CostGuard`` budget; calls that exceed the budget short-circuit
with an empty result instead of raising.
"""

import asyncio
import base64
from functools import lru_cache
from typing import Final

import structlog
from google.cloud import vision

from app.core.budget import cost_guard

logger = structlog.get_logger()

DEFAULT_LABEL_LIMIT: Final[int] = 8


@lru_cache(maxsize=1)
def _get_client() -> vision.ImageAnnotatorClient:
    """Lazily instantiate (and memoise) the Vision SDK client.

    Uses ``functools.lru_cache`` instead of a hand-rolled module-level
    ``global``: thread-safe, monkey-patch-friendly in tests via
    ``_get_client.cache_clear()``, and immune to the "forgot to declare
    global" footgun.
    """
    return vision.ImageAnnotatorClient()


class VisionAPIError(Exception):
    """Raised when the Vision API returns an explicit error payload."""


async def extract_badge_text(image_base64: str) -> list[str]:
    """OCR a badge image and return detected text lines.

    Args:
        image_base64: Badge photo bytes encoded as a base64 string.

    Returns:
        Ordered list of detected text annotations. Empty when the daily
        Vision budget is exhausted, the input is malformed, or the API
        returns an error — callers should treat empty as "no match".
    """
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
    except Exception:
        # Broad catch is intentional: badge OCR is a best-effort UX feature;
        # any failure (network, decode, malformed payload, SDK error) should
        # degrade to "no match" rather than crash the check-in flow.
        # ``logger.exception`` captures the full stack for diagnostics.
        logger.exception("badge_ocr_failed")
        return []


async def detect_labels_gcs(gcs_uri: str, max_results: int = DEFAULT_LABEL_LIMIT) -> list[str]:
    """Run label detection on a GCS-hosted image.

    Args:
        gcs_uri: ``gs://`` URI of the image to label.
        max_results: Maximum number of labels to return, ranked by
            confidence. Defaults to :data:`DEFAULT_LABEL_LIMIT`.

    Returns:
        List of label descriptions. Empty on budget exhaustion or
        transient client-side failures (network, decode).

    Raises:
        VisionAPIError: The Vision API returned a non-transient error
            (caller should surface as HTTP 502).
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
    except Exception:
        # Broad catch: label detection is best-effort. The contract with
        # the API layer is "transient failures return [], explicit Vision
        # errors raise". See ``test_transient_exception_returns_empty``.
        logger.exception("vision_label_failed")
        return []
