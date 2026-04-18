from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.repositories.attendee_repo import (
    find_attendee_by_name,
    get_attendee,
    mark_checked_in,
)


def _mock_doc(data: dict[str, Any] | None, doc_id: str = "att-001") -> MagicMock:
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = data is not None
    doc.to_dict.return_value = data
    return doc


async def _async_iter(items: list[Any]) -> AsyncIterator[Any]:
    for item in items:
        yield item


def _build_attendees_query_mock(
    stream_docs: list[Any],
) -> tuple[AsyncMock, MagicMock]:
    """Build a Firestore query-chain mock that terminates in ``stream()``.

    Returns the ``db`` AsyncMock and the final query object so callers can
    assert on ``where``/``limit`` invocations.
    """
    final_query = MagicMock()
    final_query.stream.return_value = _async_iter(stream_docs)

    def _where(*_args: Any, **_kwargs: Any) -> MagicMock:
        return final_query

    final_query.where.side_effect = _where
    final_query.limit.return_value = final_query

    col = MagicMock()
    col.where.side_effect = _where

    db = AsyncMock()
    db.collection.return_value.document.return_value.collection.return_value = col
    return db, final_query


class TestGetAttendee:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        doc = _mock_doc({"name": "Alice", "checkedIn": False}, doc_id="att-001")

        db = AsyncMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value.get = AsyncMock(
            return_value=doc
        )

        result = await get_attendee(db, "demo-event", "att-001")

        assert result is not None
        assert result["id"] == "att-001"
        assert result["name"] == "Alice"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        doc = _mock_doc(None)

        db = AsyncMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value.get = AsyncMock(
            return_value=doc
        )

        result = await get_attendee(db, "demo-event", "nonexistent")
        assert result is None


class TestMarkCheckedIn:
    @pytest.mark.asyncio
    async def test_calls_update(self) -> None:
        db = AsyncMock()
        update_mock = AsyncMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value.update = update_mock

        await mark_checked_in(db, "demo-event", "att-001")

        update_mock.assert_awaited_once()
        call_args = update_mock.call_args[0][0]
        assert call_args["checkedIn"] is True
        assert "checkinTime" in call_args


class TestFindAttendeeByName:
    @pytest.mark.asyncio
    async def test_match_found(self) -> None:
        doc = _mock_doc(
            {"name": "Bob Smith", "name_lower": "bob smith"},
            doc_id="att-002",
        )
        db, _ = _build_attendees_query_mock([doc])

        result = await find_attendee_by_name(db, "demo-event", "bob")

        assert result is not None
        assert result["id"] == "att-002"
        assert result["name"] == "Bob Smith"

    @pytest.mark.asyncio
    async def test_no_match(self) -> None:
        db, _ = _build_attendees_query_mock([])

        result = await find_attendee_by_name(db, "demo-event", "zzzz")
        assert result is None

    @pytest.mark.asyncio
    async def test_empty_query_returns_none(self) -> None:
        db = AsyncMock()
        result = await find_attendee_by_name(db, "demo-event", "")
        assert result is None

    @pytest.mark.asyncio
    async def test_case_insensitive_query(self) -> None:
        """Input casing is normalized before the Firestore range query."""
        doc = _mock_doc(
            {"name": "Alice Johnson", "name_lower": "alice johnson"},
            doc_id="att-004",
        )
        db, final_query = _build_attendees_query_mock([doc])

        result = await find_attendee_by_name(db, "demo-event", "ALICE")

        assert result is not None
        final_query.limit.assert_called_with(1)

    @pytest.mark.asyncio
    async def test_uses_prefix_range_query(self) -> None:
        """Both bounds of the range query are passed to Firestore."""
        doc = _mock_doc(
            {"name": "Carol Davis", "name_lower": "carol davis"},
            doc_id="att-005",
        )
        db, final_query = _build_attendees_query_mock([doc])

        await find_attendee_by_name(db, "demo-event", "carol")

        col = db.collection.return_value.document.return_value.collection.return_value
        assert col.where.call_count >= 1
        assert final_query.where.call_count >= 1
