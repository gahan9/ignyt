"""Authentication dependencies for FastAPI routes.

Verifies Firebase ID tokens supplied in the ``Authorization: Bearer <token>``
header and exposes them as injectable ``dict`` claims via ``Depends()``.
"""

from functools import lru_cache
from typing import Any

import firebase_admin
import structlog
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.core.config import settings

logger = structlog.get_logger()


@lru_cache(maxsize=1)
def _get_firebase_app() -> firebase_admin.App:
    """Lazily initialise (and memoise) the Firebase Admin SDK app.

    ``lru_cache`` gives us a thread-safe one-shot singleton without a
    module-level mutable global. Tests can reset via
    ``_get_firebase_app.cache_clear()`` if they ever need a fresh app.
    """
    cred = credentials.ApplicationDefault()
    return firebase_admin.initialize_app(cred, {"projectId": settings.gcp_project_id})


async def get_current_user(authorization: str = Header(...)) -> dict[str, Any]:
    """Verify a Firebase ID token and return its decoded claims.

    FastAPI dependency. Use as ``user: dict = Depends(get_current_user)``.

    Args:
        authorization: Raw ``Authorization`` request header.

    Returns:
        Decoded Firebase ID token claims (uid, email, custom claims, ...).

    Raises:
        HTTPException: 401 if the token is missing, malformed, or rejected
            by Firebase (expired, revoked, signature mismatch, network).
    """
    _get_firebase_app()
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        decoded: dict[str, Any] = firebase_auth.verify_id_token(token)
    except Exception as err:
        # Broad catch is intentional: the Firebase SDK can raise
        # ``FirebaseError``, ``ValueError`` (malformed JWT), and
        # transient network errors — every failure mode collapses to a
        # 401 for the caller. ``from err`` preserves the chain for logs.
        logger.warning(
            "auth_token_rejected",
            error_type=type(err).__name__,
            error=str(err),
        )
        raise HTTPException(status_code=401, detail="Invalid or expired token") from err
    return decoded


async def get_optional_user(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | None:
    """Verify a Firebase ID token if present, otherwise return ``None``.

    Use on routes where authentication is optional (e.g. public read paths
    that personalise their response when a caller is signed in).
    """
    if not authorization:
        return None
    return await get_current_user(authorization)
