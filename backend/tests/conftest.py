"""Pytest fixtures and shared test helpers for the API test suite."""

from __future__ import annotations

import os

# Disable the per-identity rate limiter for the test suite. The middleware
# is sized for production traffic (60 burst, 1/sec sustained), which would
# trip and flake the tests as soon as a single test file does ~60 requests.
# Set BEFORE importing ``app.main`` so the middleware is never installed.
os.environ.setdefault("EP_RATE_LIMIT_ENABLED", "false")

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.budget import CostGuard, cost_guard
from app.core.dependencies import get_firestore
from app.core.security import get_current_user, get_optional_user
from app.main import app


async def async_iter_from_list(items: list[Any]) -> AsyncIterator[Any]:
    """Yield *items* for async Firestore ``stream()`` mocks."""
    for item in items:
        yield item


FAKE_USER: dict[str, Any] = {
    "uid": "test-user-123",
    "email": "test@example.com",
    "name": "Test User",
}


async def _fake_current_user() -> dict[str, Any]:
    return FAKE_USER


async def _fake_optional_user() -> dict[str, Any] | None:
    return FAKE_USER


@pytest.fixture(autouse=True)
def _reset_cost_guard() -> None:
    cost_guard._gemini_count = 0
    cost_guard._vision_count = 0


@pytest.fixture()
def fresh_cost_guard() -> CostGuard:
    return CostGuard()


@pytest.fixture()
def mock_db() -> AsyncMock:
    return AsyncMock()


@pytest.fixture()
def authed_client(mock_db: AsyncMock) -> TestClient:
    app.dependency_overrides[get_current_user] = _fake_current_user
    app.dependency_overrides[get_optional_user] = _fake_optional_user
    app.dependency_overrides[get_firestore] = lambda: mock_db

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture()
def unauthed_client() -> TestClient:
    app.dependency_overrides.clear()

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    app.dependency_overrides.clear()


def make_mock_doc(data: dict[str, Any] | None, doc_id: str = "test-doc-id") -> MagicMock:
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = data is not None
    doc.to_dict.return_value = data
    return doc
