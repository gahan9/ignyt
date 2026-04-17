from datetime import datetime, timezone
from typing import Any

import structlog
from google.cloud.firestore_v1 import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

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
    """Case-insensitive prefix match on the indexed ``name_lower`` field.

    Each attendee document must store ``name_lower`` (lowercase form of
    ``name``) so Firestore can answer the prefix search with a range query
    instead of a full collection scan. Prefix semantics use ``\\uf8ff`` as
    the upper bound — the highest BMP code point commonly used for this.
    """
    query = name_query.strip().lower()
    if not query:
        return None

    col = db.collection("events").document(event_id).collection("attendees")
    snapshots = (
        col.where(filter=FieldFilter("name_lower", ">=", query))
        .where(filter=FieldFilter("name_lower", "<", query + "\uf8ff"))
        .limit(1)
        .stream()
    )

    async for doc in snapshots:
        data = doc.to_dict()
        if data:
            return {"id": doc.id, **data}

    return None
