"""Shared FastAPI dependency providers (Firestore client, etc.).

Centralises the singleton lifecycle for clients we want to share across
requests. Imported by API modules via ``Depends(get_firestore)``.
"""

from google.cloud.firestore_v1 import AsyncClient

from app.core.config import settings

_db: AsyncClient | None = None


def get_firestore() -> AsyncClient:
    """Return the process-wide async Firestore client.

    Lazy-initialised on first use so unit tests can patch ``AsyncClient``
    before the first call. Use as ``db = Depends(get_firestore)``.
    """
    global _db
    if _db is None:
        _db = AsyncClient(project=settings.gcp_project_id)
    return _db
