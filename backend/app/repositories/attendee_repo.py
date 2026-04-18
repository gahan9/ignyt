"""Firestore queries against the per-event ``attendees`` subcollection.

Document shape (per attendee):
    ``{ name: str, name_lower: str, checkedIn: bool, checkinTime: ISO8601 }``

The ``name_lower`` field is denormalised so :func:`find_attendee_by_name`
can answer a case-insensitive prefix search with an indexed range query.
"""

from datetime import UTC, datetime
from typing import Any, Final

import structlog
from google.cloud.firestore_v1 import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

logger = structlog.get_logger()

# Highest BMP code point — used as the inclusive upper bound for Firestore
# prefix range queries on ``name_lower``.
PREFIX_QUERY_UPPER_BOUND: Final[str] = "\uf8ff"


async def get_attendee(db: AsyncClient, event_id: str, attendee_id: str) -> dict[str, Any] | None:
    """Fetch an attendee document by id.

    Args:
        db: Async Firestore client.
        event_id: Parent event id.
        attendee_id: Attendee document id under the event.

    Returns:
        Document data with ``id`` injected, or ``None`` if not found.
    """
    doc = await (
        db.collection("events")
        .document(event_id)
        .collection("attendees")
        .document(attendee_id)
        .get()
    )
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    return {"id": doc.id, **data}


async def mark_checked_in(db: AsyncClient, event_id: str, attendee_id: str) -> None:
    """Flip an attendee's ``checkedIn`` flag and stamp the time.

    Idempotent: re-running on an already-checked-in attendee just refreshes
    the ``checkinTime``. Caller is responsible for the existence check.
    """
    ref = db.collection("events").document(event_id).collection("attendees").document(attendee_id)
    await ref.update(
        {
            "checkedIn": True,
            "checkinTime": datetime.now(tz=UTC).isoformat(),
        }
    )
    logger.info("attendee_checked_in", event=event_id, attendee=attendee_id)


async def find_attendee_by_name(
    db: AsyncClient, event_id: str, name_query: str
) -> dict[str, Any] | None:
    """Case-insensitive prefix match on the indexed ``name_lower`` field.

    Args:
        db: Async Firestore client.
        event_id: Parent event id.
        name_query: Raw query string from the client (will be trimmed and
            lowercased before matching).

    Returns:
        First matching attendee document with ``id`` injected, or ``None``
        if the (trimmed) query is empty or no attendee matches.
    """
    query = name_query.strip().lower()
    if not query:
        return None

    col = db.collection("events").document(event_id).collection("attendees")
    snapshots = (
        col.where(filter=FieldFilter("name_lower", ">=", query))
        .where(filter=FieldFilter("name_lower", "<", query + PREFIX_QUERY_UPPER_BOUND))
        .limit(1)
        .stream()
    )

    async for doc in snapshots:
        data = doc.to_dict()
        if data:
            return {"id": doc.id, **data}

    return None
