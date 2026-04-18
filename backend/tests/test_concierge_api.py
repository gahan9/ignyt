from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient


async def _fake_stream(_messages: list[dict[str, Any]]) -> AsyncIterator[str]:
    yield "Hello "
    yield "world"


class TestConciergeChat:
    def test_streams_response(self, authed_client: TestClient) -> None:
        with patch("app.api.v1.concierge.chat_stream", side_effect=_fake_stream):
            resp = authed_client.post(
                "/api/v1/concierge/chat",
                json={"messages": [{"role": "user", "content": "Where is Room A?"}]},
            )

        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/plain")
        assert "Hello world" in resp.text

    def test_multi_turn_conversation(self, authed_client: TestClient) -> None:
        with patch("app.api.v1.concierge.chat_stream", side_effect=_fake_stream):
            resp = authed_client.post(
                "/api/v1/concierge/chat",
                json={
                    "messages": [
                        {"role": "user", "content": "When is lunch?"},
                        {"role": "assistant", "content": "12:00-13:00"},
                        {"role": "user", "content": "Where?"},
                    ]
                },
            )

        assert resp.status_code == 200

    def test_invalid_role_returns_422(self, authed_client: TestClient) -> None:
        resp = authed_client.post(
            "/api/v1/concierge/chat",
            json={"messages": [{"role": "system", "content": "nope"}]},
        )
        assert resp.status_code == 422

    def test_empty_messages_returns_422(self, authed_client: TestClient) -> None:
        resp = authed_client.post(
            "/api/v1/concierge/chat",
            json={"messages": []},
        )
        assert resp.status_code == 422

    def test_empty_content_returns_422(self, authed_client: TestClient) -> None:
        resp = authed_client.post(
            "/api/v1/concierge/chat",
            json={"messages": [{"role": "user", "content": ""}]},
        )
        assert resp.status_code == 422


class TestBudgetEndpoint:
    def test_returns_budget_status(self, authed_client: TestClient) -> None:
        resp = authed_client.get("/api/v1/budget")

        assert resp.status_code == 200
        body = resp.json()
        assert "gemini_used" in body
        assert "gemini_limit" in body
        assert "vision_used" in body
        assert "vision_limit" in body

    def test_budget_no_auth_required(self, unauthed_client: TestClient) -> None:
        resp = unauthed_client.get("/api/v1/budget")
        assert resp.status_code == 200
