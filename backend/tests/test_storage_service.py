from unittest.mock import MagicMock, patch

import pytest

from app.services.storage import generate_signed_upload_url


class TestGenerateSignedUploadUrl:
    @pytest.mark.asyncio
    async def test_returns_url_and_gcs_uri(self) -> None:
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/signed"

        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob

        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        with patch("app.services.storage._get_client", return_value=mock_client):
            url, gcs_uri = await generate_signed_upload_url(
                "my-bucket", "event-1", "photo.jpg", "image/jpeg"
            )

        assert url == "https://storage.googleapis.com/signed"
        assert gcs_uri.startswith("gs://my-bucket/events/event-1/photos/")
        assert gcs_uri.endswith("_photo.jpg")

    @pytest.mark.asyncio
    async def test_gcs_uri_format(self) -> None:
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://signed"

        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob

        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        with patch("app.services.storage._get_client", return_value=mock_client):
            _, gcs_uri = await generate_signed_upload_url(
                "bucket", "evt", "img.png", "image/png"
            )

        assert "events/evt/photos/" in gcs_uri
        assert gcs_uri.endswith("_img.png")

    @pytest.mark.asyncio
    async def test_signed_url_params(self) -> None:
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://signed"

        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob

        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        with patch("app.services.storage._get_client", return_value=mock_client):
            await generate_signed_upload_url("b", "e", "f.jpg", "image/jpeg")

        call_kwargs = mock_blob.generate_signed_url.call_args.kwargs
        assert call_kwargs["version"] == "v4"
        assert call_kwargs["method"] == "PUT"
        assert call_kwargs["content_type"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_unique_names_differ(self) -> None:
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://signed"

        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob

        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        with patch("app.services.storage._get_client", return_value=mock_client):
            _, uri1 = await generate_signed_upload_url("b", "e", "f.jpg", "image/jpeg")
            _, uri2 = await generate_signed_upload_url("b", "e", "f.jpg", "image/jpeg")

        assert uri1 != uri2
