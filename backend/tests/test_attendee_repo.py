from unittest.mock import AsyncMock, MagicMock

import pytest

from app.repositories.attendee_repo import find_attendee_by_name, get_attendee, mark_checked_in


def _mock_doc(data: dict | None, doc_id: str = "att-001") -> MagicMock:
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = data is not None
    doc.to_dict.return_value = data
    return doc


class TestGetAttendee:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        doc = _mock_doc({"name": "Alice", "checkedIn": False}, doc_id="att-001")

        db = AsyncMock()
        db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value \
            .get = AsyncMock(return_value=doc)

        result = await get_attendee(db, "demo-event", "att-001")

        assert result is not None
        assert result["id"] == "att-001"
        assert result["name"] == "Alice"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        doc = _mock_doc(None)

        db = AsyncMock()
        db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value \
            .get = AsyncMock(return_value=doc)

        result = await get_attendee(db, "demo-event", "nonexistent")
        assert result is None


class TestMarkCheckedIn:
    @pytest.mark.asyncio
    async def test_calls_update(self) -> None:
        db = AsyncMock()
        update_mock = AsyncMock()
        db.collection.return_value.document.return_value \
            .collection.return_value.document.return_value \
            .update = update_mock

        await mark_checked_in(db, "demo-event", "att-001")

        update_mock.assert_awaited_once()
        call_args = update_mock.call_args[0][0]
        assert call_args["checkedIn"] is True
        assert "checkinTime" in call_args


class TestFindAttendeeByName:
    @pytest.mark.asyncio
    async def test_match_found(self) -> None:
        doc = MagicMock()
        doc.id = "att-002"
        doc.to_dict.return_value = {"name": "Bob Smith", "email": "bob@test.com"}

        db = AsyncMock()
        db.collection.return_value.document.return_value \
            .collection.return_value.stream.return_value = _async_iter([doc])

        result = await find_attendee_by_name(db, "demo-event", "bob")

        assert result is not None
        assert result["id"] == "att-002"

    @pytest.mark.asyncio
    async def test_no_match(self) -> None:
        doc = MagicMock()
        doc.id = "att-003"
        doc.to_dict.return_value = {"name": "Charlie", "email": "c@test.com"}

        db = AsyncMock()
        db.collection.return_value.document.return_value \
            .collection.return_value.stream.return_value = _async_iter([doc])

        result = await find_attendee_by_name(db, "demo-event", "zzzz")
        assert result is None

    @pytest.mark.asyncio
    async def test_empty_query_returns_none(self) -> None:
        db = AsyncMock()
        result = await find_attendee_by_name(db, "demo-event", "")
        assert result is None

    @pytest.mark.asyncio
    async def test_case_insensitive(self) -> None:
        doc = MagicMock()
        doc.id = "att-004"
        doc.to_dict.return_value = {"name": "Alice Johnson"}

        db = AsyncMock()
        db.collection.return_value.document.return_value \
            .collection.return_value.stream.return_value = _async_iter([doc])

        result = await find_attendee_by_name(db, "demo-event", "ALICE")
        assert result is not None


async def _async_iter(items: list):
    for item in items:
        yield item
