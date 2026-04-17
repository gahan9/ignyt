from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.budget import CostGuard, cost_guard
from app.core.dependencies import get_firestore
from app.core.security import get_current_user, get_optional_user
from app.main import app

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
        yield client  # type: ignore[misc]

    app.dependency_overrides.clear()


@pytest.fixture()
def unauthed_client() -> TestClient:
    app.dependency_overrides.clear()

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client  # type: ignore[misc]

    app.dependency_overrides.clear()


def make_mock_doc(
    data: dict[str, Any] | None, doc_id: str = "test-doc-id"
) -> MagicMock:
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = data is not None
    doc.to_dict.return_value = data
    return doc
