from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.core.budget import cost_guard
from app.services.vision import VisionAPIError


class TestGetUploadUrl:
    def test_success(self, authed_client: TestClient) -> None:
        with patch(
            "app.api.v1.photos.generate_signed_upload_url",
            new=AsyncMock(return_value=("https://signed-url", "gs://bucket/path")),
        ):
            resp = authed_client.post(
                "/api/v1/photos/upload-url",
                json={
                    "event_id": "demo-event",
                    "filename": "pic.jpg",
                    "content_type": "image/jpeg",
                },
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["upload_url"] == "https://signed-url"
        assert body["gcs_uri"] == "gs://bucket/path"

    def test_missing_filename_returns_422(self, authed_client: TestClient) -> None:
        resp = authed_client.post(
            "/api/v1/photos/upload-url",
            json={"event_id": "demo-event"},
        )
        assert resp.status_code == 422


class TestLabelPhoto:
    def test_success(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        mock_doc_ref = AsyncMock()
        mock_doc_ref.id = "photo-001"
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

        with patch(
            "app.api.v1.photos.detect_labels_gcs",
            new=AsyncMock(return_value=["sunset"]),
        ):
            resp = authed_client.post(
                "/api/v1/photos/label",
                json={"event_id": "demo-event", "gcs_uri": "gs://bucket/img.jpg"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert "sunset" in body["labels"]
        assert body["photo_id"] == "photo-001"

    def test_budget_exceeded_returns_429(self, authed_client: TestClient) -> None:
        cost_guard._vision_count = 999

        resp = authed_client.post(
            "/api/v1/photos/label",
            json={"event_id": "demo-event", "gcs_uri": "gs://bucket/img.jpg"},
        )

        assert resp.status_code == 429

    def test_vision_api_error(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        with patch(
            "app.api.v1.photos.detect_labels_gcs",
            new=AsyncMock(side_effect=VisionAPIError("INTERNAL_ERROR")),
        ):
            resp = authed_client.post(
                "/api/v1/photos/label",
                json={"event_id": "demo-event", "gcs_uri": "gs://bucket/img.jpg"},
            )

        assert resp.status_code == 502

    def test_vision_transient_returns_empty_labels(
        self, authed_client: TestClient, mock_db: MagicMock
    ) -> None:
        mock_doc_ref = AsyncMock()
        mock_doc_ref.id = "photo-002"
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

        with patch(
            "app.api.v1.photos.detect_labels_gcs",
            new=AsyncMock(return_value=[]),
        ):
            resp = authed_client.post(
                "/api/v1/photos/label",
                json={"event_id": "demo-event", "gcs_uri": "gs://bucket/img.jpg"},
            )

        assert resp.status_code == 200
        assert resp.json()["labels"] == []

    def test_saves_to_firestore(self, authed_client: TestClient, mock_db: MagicMock) -> None:
        mock_doc_ref = AsyncMock()
        mock_doc_ref.id = "photo-003"
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

        with patch(
            "app.api.v1.photos.detect_labels_gcs",
            new=AsyncMock(return_value=["label-a"]),
        ):
            authed_client.post(
                "/api/v1/photos/label",
                json={"event_id": "demo-event", "gcs_uri": "gs://bucket/img.jpg"},
            )

        mock_doc_ref.set.assert_awaited_once()
        saved = mock_doc_ref.set.call_args[0][0]
        assert saved["gcsUri"] == "gs://bucket/img.jpg"
        assert saved["uploadedBy"] == "test-user-123"
        assert saved["labels"] == ["label-a"]
        assert isinstance(saved["timestamp"], int)
