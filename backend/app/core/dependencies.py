"""Shared FastAPI dependency providers (Firestore client, etc.).

Centralises the singleton lifecycle for clients we want to share across
requests. Imported by API modules via ``Depends(get_firestore)``.
"""

from functools import lru_cache

from google.cloud.firestore_v1 import AsyncClient

from app.core.config import settings


@lru_cache(maxsize=1)
def get_firestore() -> AsyncClient:
    """Return the process-wide async Firestore client.

    Lazy-initialised on first use so unit tests can patch ``AsyncClient``
    before the first call. Use as ``db = Depends(get_firestore)``.

    ``lru_cache`` provides a thread-safe singleton without a module-level
    mutable global; call ``get_firestore.cache_clear()`` from a fixture if
    a test ever needs a fresh client.
    """
    return AsyncClient(project=settings.gcp_project_id)
