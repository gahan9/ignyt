from google.cloud.firestore_v1 import AsyncClient

from app.core.config import settings

_db: AsyncClient | None = None


def get_firestore() -> AsyncClient:
    """Singleton async Firestore client, injected via FastAPI Depends()."""
    global _db
    if _db is None:
        _db = AsyncClient(project=settings.gcp_project_id)
    return _db
