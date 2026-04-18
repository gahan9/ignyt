from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.core.security import get_current_user, get_optional_user


class TestGetCurrentUser:
    @pytest.mark.asyncio
    async def test_missing_token_raises_401(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(authorization="")
        assert exc_info.value.status_code == 401
        assert "Missing token" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_bearer_prefix_stripped(self) -> None:
        decoded = {"uid": "u1", "email": "a@b.com"}

        with (
            patch("app.core.security._get_firebase_app"),
            patch("app.core.security.firebase_auth.verify_id_token", return_value=decoded),
        ):
            result = await get_current_user(authorization="Bearer fake-token")

        assert result["uid"] == "u1"

    @pytest.mark.asyncio
    async def test_raw_token_accepted(self) -> None:
        decoded = {"uid": "u2"}

        with (
            patch("app.core.security._get_firebase_app"),
            patch("app.core.security.firebase_auth.verify_id_token", return_value=decoded),
        ):
            result = await get_current_user(authorization="raw-token")

        assert result["uid"] == "u2"

    @pytest.mark.asyncio
    async def test_invalid_token_raises_401(self) -> None:
        with (
            patch("app.core.security._get_firebase_app"),
            patch(
                "app.core.security.firebase_auth.verify_id_token",
                side_effect=Exception("bad token"),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_current_user(authorization="Bearer bad-token")

        assert exc_info.value.status_code == 401
        assert "Invalid or expired" in exc_info.value.detail


class TestGetOptionalUser:
    @pytest.mark.asyncio
    async def test_no_header_returns_none(self) -> None:
        result = await get_optional_user(authorization=None)
        assert result is None

    @pytest.mark.asyncio
    async def test_with_header_delegates_to_current_user(self) -> None:
        decoded = {"uid": "u3"}

        with (
            patch("app.core.security._get_firebase_app"),
            patch("app.core.security.firebase_auth.verify_id_token", return_value=decoded),
        ):
            result = await get_optional_user(authorization="Bearer valid")

        assert result is not None
        assert result["uid"] == "u3"
