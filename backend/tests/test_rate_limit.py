"""Tests for ``app.core.rate_limit``: token-bucket math + middleware."""

from __future__ import annotations

import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimiterMiddleware, TokenBucket


class TestTokenBucket:
    def test_starts_full_capacity(self) -> None:
        bucket = TokenBucket(capacity=5, refill_per_sec=1.0)
        for _ in range(5):
            assert bucket.take() is True
        assert bucket.take() is False

    def test_refills_over_time(self) -> None:
        bucket = TokenBucket(capacity=2, refill_per_sec=100.0)
        assert bucket.take() is True
        assert bucket.take() is True
        assert bucket.take() is False
        time.sleep(0.05)
        assert bucket.take() is True

    def test_take_n_atomic(self) -> None:
        bucket = TokenBucket(capacity=3, refill_per_sec=0.0)
        assert bucket.take(3) is True
        assert bucket.take(1) is False

    def test_capacity_clamps_refill(self) -> None:
        bucket = TokenBucket(capacity=2, refill_per_sec=1000.0)
        time.sleep(0.05)
        assert bucket.take() is True
        assert bucket.take() is True
        assert bucket.take() is False


def _make_app(*, capacity: int = 2, refill: float = 0.0) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        RateLimiterMiddleware,
        capacity=capacity,
        refill_per_sec=refill,
    )

    @app.get("/api/v1/probe")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/api/v1/budget")
    async def budget() -> dict[str, bool]:
        return {"ok": True}

    return app


class TestRateLimiterMiddleware:
    def test_blocks_after_capacity(self) -> None:
        with TestClient(_make_app(capacity=2, refill=0.0)) as client:
            assert client.get("/api/v1/probe").status_code == 200
            assert client.get("/api/v1/probe").status_code == 200
            blocked = client.get("/api/v1/probe")
            assert blocked.status_code == 429
            assert blocked.headers.get("retry-after") == "1"
            assert "Too many requests" in blocked.json()["detail"]

    def test_bypasses_health(self) -> None:
        with TestClient(_make_app(capacity=1, refill=0.0)) as client:
            for _ in range(5):
                assert client.get("/health").status_code == 200

    def test_bypasses_budget(self) -> None:
        with TestClient(_make_app(capacity=1, refill=0.0)) as client:
            for _ in range(5):
                assert client.get("/api/v1/budget").status_code == 200

    def test_isolates_identities_by_bearer(self) -> None:
        with TestClient(_make_app(capacity=1, refill=0.0)) as client:
            assert (
                client.get(
                    "/api/v1/probe",
                    headers={"Authorization": "Bearer alice"},
                ).status_code
                == 200
            )
            assert (
                client.get(
                    "/api/v1/probe",
                    headers={"Authorization": "Bearer bob"},
                ).status_code
                == 200
            )
            blocked = client.get(
                "/api/v1/probe",
                headers={"Authorization": "Bearer alice"},
            )
            assert blocked.status_code == 429
