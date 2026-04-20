from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from tests.conftest import async_iter_from_list, make_mock_doc


def _wire_attendee_query(mock_db: MagicMock, stream_docs: list[Any]) -> None:
    """Wire the Firestore where/where/limit/stream chain used by
    ``find_attendee_by_name``."""
    final_query = MagicMock()
    final_query.stream.return_value = async_iter_from_list(stream_docs)
    final_query.where.return_value = final_query
    final_query.limit.return_value = final_query

    col = mock_db.collection.return_value.document.return_value.collection.return_value
    col.where.return_value = final_query


class TestScanCheckin:
    def test_success(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        doc = make_mock_doc({"name": "Alice", "checkedIn": False}, doc_id="att-001")
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.get = AsyncMock(
            return_value=doc
        )
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.update = AsyncMock()

        resp = authed_client.post(
            "/api/v1/checkin/scan",
            json={"event_id": "demo-event", "attendee_id": "att-001"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["checked_in"] is True
        assert body["name"] == "Alice"
        assert body["message"] == "Check-in successful!"

    def test_already_checked_in(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        doc = make_mock_doc({"name": "Bob", "checkedIn": True}, doc_id="att-002")
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.get = AsyncMock(
            return_value=doc
        )

        resp = authed_client.post(
            "/api/v1/checkin/scan",
            json={"event_id": "demo-event", "attendee_id": "att-002"},
        )

        assert resp.status_code == 200
        assert resp.json()["message"] == "Already checked in"

    def test_attendee_not_found(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        doc = make_mock_doc(None)
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.get = AsyncMock(
            return_value=doc
        )

        resp = authed_client.post(
            "/api/v1/checkin/scan",
            json={"event_id": "demo-event", "attendee_id": "nonexistent"},
        )

        assert resp.status_code == 404

    def test_missing_fields_returns_422(self, authed_client: TestClient) -> None:
        resp = authed_client.post("/api/v1/checkin/scan", json={"event_id": "e1"})
        assert resp.status_code == 422


class TestBadgeOcr:
    def test_match_found(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        attendee_doc = MagicMock()
        attendee_doc.id = "att-010"
        attendee_doc.to_dict.return_value = {
            "name": "Alice Smith",
            "name_lower": "alice smith",
        }
        _wire_attendee_query(mock_db, [attendee_doc])

        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.update = AsyncMock()

        with patch(
            "app.api.v1.checkin.extract_badge_text",
            new=AsyncMock(return_value=["Alice Smith\nEngineer"]),
        ):
            resp = authed_client.post(
                "/api/v1/checkin/badge",
                json={"event_id": "demo-event", "image_base64": "ZmFrZQ=="},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["matched_attendee"] == "att-010"
        assert body["confidence"] > 0

    def test_no_text_detected(self, authed_client: TestClient) -> None:
        with patch(
            "app.api.v1.checkin.extract_badge_text",
            new=AsyncMock(return_value=[]),
        ):
            resp = authed_client.post(
                "/api/v1/checkin/badge",
                json={"event_id": "demo-event", "image_base64": "ZmFrZQ=="},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["detected_text"] == []
        assert body["matched_attendee"] is None

    def test_text_but_no_match(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        _wire_attendee_query(mock_db, [])

        with patch(
            "app.api.v1.checkin.extract_badge_text",
            new=AsyncMock(return_value=["Unknown Person"]),
        ):
            resp = authed_client.post(
                "/api/v1/checkin/badge",
                json={"event_id": "demo-event", "image_base64": "ZmFrZQ=="},
            )

        assert resp.status_code == 200
        assert resp.json()["matched_attendee"] is None
