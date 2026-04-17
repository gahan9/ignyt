from typing import Any

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth, credentials

from app.core.config import settings

_firebase_app: firebase_admin.App | None = None


def _get_firebase_app() -> firebase_admin.App:
    global _firebase_app
    if _firebase_app is None:
        cred = credentials.ApplicationDefault()
        _firebase_app = firebase_admin.initialize_app(
            cred, {"projectId": settings.gcp_project_id}
        )
    return _firebase_app


async def get_current_user(authorization: str = Header(...)) -> dict[str, Any]:
    """FastAPI dependency — verifies Firebase ID token, returns decoded claims."""
    _get_firebase_app()
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return decoded


async def get_optional_user(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | None:
    """Same as get_current_user but returns None for unauthenticated requests."""
    if not authorization:
        return None
    return await get_current_user(authorization)
