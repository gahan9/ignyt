from datetime import datetime, timezone
from typing import Any

import structlog
from google.cloud.firestore_v1 import AsyncClient

logger = structlog.get_logger()


async def get_attendee(
    db: AsyncClient, event_id: str, attendee_id: str
) -> dict[str, Any] | None:
    doc = await db.collection("events").document(event_id).collection(
        "attendees"
    ).document(attendee_id).get()
    if not doc.exists:
        return None
    return {"id": doc.id, **doc.to_dict()}  # type: ignore[union-attr]


async def mark_checked_in(
    db: AsyncClient, event_id: str, attendee_id: str
) -> None:
    ref = (
        db.collection("events")
        .document(event_id)
        .collection("attendees")
        .document(attendee_id)
    )
    await ref.update({
        "checkedIn": True,
        "checkinTime": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("attendee_checked_in", event=event_id, attendee=attendee_id)


async def find_attendee_by_name(
    db: AsyncClient, event_id: str, name_query: str
) -> dict[str, Any] | None:
    """Fuzzy-ish name match: case-insensitive prefix search."""
    query = name_query.strip().lower()
    if not query:
        return None

    col = db.collection("events").document(event_id).collection("attendees")
    docs = col.stream()

    async for doc in docs:
        data = doc.to_dict()
        if data and data.get("name", "").lower().startswith(query):
            return {"id": doc.id, **data}

    return None
