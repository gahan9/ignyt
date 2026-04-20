"""Cross-cutting tests for the v1 router (cache headers, etc.)."""

from __future__ import annotations

from fastapi.testclient import TestClient


class TestBudgetCacheControl:
    """``/api/v1/budget`` is polled by dashboards; cache headers protect it."""

    def test_emits_short_cache_control(self, unauthed_client: TestClient) -> None:
        resp = unauthed_client.get("/api/v1/budget")
        assert resp.status_code == 200, resp.text
        cc = resp.headers.get("cache-control", "")
        assert "max-age=10" in cc
        assert "public" in cc
        assert "must-revalidate" in cc

    def test_returns_expected_keys(self, unauthed_client: TestClient) -> None:
        resp = unauthed_client.get("/api/v1/budget")
        body = resp.json()
        assert {
            "gemini_used",
            "gemini_limit",
            "vision_used",
            "vision_limit",
        } <= body.keys()
