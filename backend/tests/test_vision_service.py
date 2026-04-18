import base64
from unittest.mock import MagicMock, patch

import pytest

from app.core.budget import cost_guard
from app.services.vision import VisionAPIError, detect_labels_gcs, extract_badge_text

SAMPLE_B64 = base64.b64encode(b"fake-image-bytes").decode()


class TestExtractBadgeText:
    @pytest.mark.asyncio
    async def test_success_returns_texts(self) -> None:
        annotation_1 = MagicMock()
        annotation_1.description = "Alice Smith\nEngineer"
        annotation_2 = MagicMock()
        annotation_2.description = "Alice Smith"

        mock_response = MagicMock()
        mock_response.error.message = ""
        mock_response.text_annotations = [annotation_1, annotation_2]

        mock_client = MagicMock()
        mock_client.text_detection.return_value = mock_response

        with patch("app.services.vision._get_client", return_value=mock_client):
            result = await extract_badge_text(SAMPLE_B64)

        assert len(result) == 2
        assert "Alice Smith\nEngineer" in result

    @pytest.mark.asyncio
    async def test_budget_exhausted_returns_empty(self) -> None:
        cost_guard._vision_count = 999

        with patch("app.core.budget.settings") as mock_settings:
            mock_settings.daily_vision_calls = 50
            result = await extract_badge_text(SAMPLE_B64)

        assert result == []

    @pytest.mark.asyncio
    async def test_api_error_returns_empty(self) -> None:
        mock_response = MagicMock()
        mock_response.error.message = "PERMISSION_DENIED"
        mock_response.text_annotations = []

        mock_client = MagicMock()
        mock_client.text_detection.return_value = mock_response

        with patch("app.services.vision._get_client", return_value=mock_client):
            result = await extract_badge_text(SAMPLE_B64)

        assert result == []

    @pytest.mark.asyncio
    async def test_exception_returns_empty(self) -> None:
        mock_client = MagicMock()
        mock_client.text_detection.side_effect = RuntimeError("network error")

        with patch("app.services.vision._get_client", return_value=mock_client):
            result = await extract_badge_text(SAMPLE_B64)

        assert result == []

    @pytest.mark.asyncio
    async def test_records_vision_usage(self) -> None:
        mock_response = MagicMock()
        mock_response.error.message = ""
        mock_response.text_annotations = []

        mock_client = MagicMock()
        mock_client.text_detection.return_value = mock_response

        before = cost_guard._vision_count

        with patch("app.services.vision._get_client", return_value=mock_client):
            await extract_badge_text(SAMPLE_B64)

        assert cost_guard._vision_count == before + 1


class TestDetectLabelsGcs:
    @pytest.mark.asyncio
    async def test_success_returns_labels(self) -> None:
        label_1 = MagicMock()
        label_1.description = "sunset"
        label_2 = MagicMock()
        label_2.description = "ocean"

        mock_response = MagicMock()
        mock_response.error.message = ""
        mock_response.label_annotations = [label_1, label_2]

        mock_client = MagicMock()
        mock_client.label_detection.return_value = mock_response

        with patch("app.services.vision._get_client", return_value=mock_client):
            result = await detect_labels_gcs("gs://bucket/img.jpg")

        assert result == ["sunset", "ocean"]

    @pytest.mark.asyncio
    async def test_budget_exhausted_returns_empty(self) -> None:
        cost_guard._vision_count = 999

        with patch("app.core.budget.settings") as mock_settings:
            mock_settings.daily_vision_calls = 50
            result = await detect_labels_gcs("gs://bucket/img.jpg")

        assert result == []

    @pytest.mark.asyncio
    async def test_api_error_raises(self) -> None:
        mock_response = MagicMock()
        mock_response.error.message = "INTERNAL_ERROR"
        mock_response.label_annotations = []

        mock_client = MagicMock()
        mock_client.label_detection.return_value = mock_response

        with patch("app.services.vision._get_client", return_value=mock_client):
            with pytest.raises(VisionAPIError):
                await detect_labels_gcs("gs://bucket/img.jpg")

    @pytest.mark.asyncio
    async def test_transient_exception_returns_empty(self) -> None:
        mock_client = MagicMock()
        mock_client.label_detection.side_effect = RuntimeError("transient")

        with patch("app.services.vision._get_client", return_value=mock_client):
            result = await detect_labels_gcs("gs://bucket/img.jpg")

        assert result == []

    @pytest.mark.asyncio
    async def test_records_vision_usage(self) -> None:
        mock_response = MagicMock()
        mock_response.error.message = ""
        mock_response.label_annotations = []

        mock_client = MagicMock()
        mock_client.label_detection.return_value = mock_response

        before = cost_guard._vision_count

        with patch("app.services.vision._get_client", return_value=mock_client):
            await detect_labels_gcs("gs://bucket/img.jpg")

        assert cost_guard._vision_count == before + 1
