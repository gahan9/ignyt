from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mock_firestore() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_gemini() -> MagicMock:
    return MagicMock()
