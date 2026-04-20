"""reCAPTCHA v3 server-side verification as a FastAPI dependency.

Validates the ``X-Recaptcha-Token`` header against Google's siteverify
endpoint. Disabled gracefully when ``EP_RECAPTCHA_SECRET_KEY`` is empty,
so local development and tests work without a key.
"""

from http import HTTPStatus
from typing import Any

import httpx
import structlog
from fastapi import Header, HTTPException

from app.core.config import settings

logger = structlog.get_logger()

_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


async def verify_recaptcha(
    x_recaptcha_token: str | None = Header(default=None),
) -> dict[str, Any] | None:
    """Verify a reCAPTCHA v3 token and return the parsed response.

    Skips verification when no secret key is configured (dev/test).
    Raises 403 when the token is missing, invalid, or scores below
    the configured threshold.
    """
    if not settings.recaptcha_secret_key:
        return None

    if not x_recaptcha_token:
        raise HTTPException(status_code=403, detail="Missing reCAPTCHA token")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            _VERIFY_URL,
            data={
                "secret": settings.recaptcha_secret_key,
                "response": x_recaptcha_token,
            },
        )

    if resp.status_code != HTTPStatus.OK:
        logger.warning("recaptcha_verify_http_error", status=resp.status_code)
        raise HTTPException(status_code=502, detail="reCAPTCHA verification unavailable")

    result: dict[str, Any] = resp.json()

    if not result.get("success"):
        logger.warning("recaptcha_failed", error_codes=result.get("error-codes"))
        raise HTTPException(status_code=403, detail="reCAPTCHA verification failed")

    score: float = result.get("score", 0.0)
    if score < settings.recaptcha_score_threshold:
        logger.warning("recaptcha_low_score", score=score)
        raise HTTPException(status_code=403, detail="Request blocked by reCAPTCHA")

    return result
