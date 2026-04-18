from unittest.mock import MagicMock, patch

import pytest

from app.core.budget import cost_guard
from app.services.gemini import chat_stream


def _make_mock_model(chunks: list[str]) -> MagicMock:
    mock_chunk_objs = []
    for text in chunks:
        chunk = MagicMock()
        chunk.text = text
        mock_chunk_objs.append(chunk)

    mock_response = MagicMock()
    mock_response.__iter__ = MagicMock(return_value=iter(mock_chunk_objs))

    mock_chat = MagicMock()
    mock_chat.send_message.return_value = mock_response

    model = MagicMock()
    model.start_chat.return_value = mock_chat
    return model


class TestChatStream:
    @pytest.mark.asyncio
    async def test_yields_chunks(self) -> None:
        model = _make_mock_model(["Hello", " world"])

        with patch("app.services.gemini._get_model", return_value=model):
            chunks = [c async for c in chat_stream([{"role": "user", "content": "hi"}])]

        assert chunks == ["Hello", " world"]

    @pytest.mark.asyncio
    async def test_budget_exhausted_yields_limit_message(self) -> None:
        cost_guard._gemini_count = 999

        with patch("app.core.budget.settings") as mock_settings:
            mock_settings.daily_gemini_requests = 100
            chunks = [c async for c in chat_stream([{"role": "user", "content": "hi"}])]

        assert len(chunks) == 1
        assert "daily conversation limit" in chunks[0]

    @pytest.mark.asyncio
    async def test_records_gemini_usage(self) -> None:
        model = _make_mock_model(["response"])

        before = cost_guard._gemini_count

        with patch("app.services.gemini._get_model", return_value=model):
            _ = [c async for c in chat_stream([{"role": "user", "content": "hi"}])]

        assert cost_guard._gemini_count == before + 1

    @pytest.mark.asyncio
    async def test_history_formatted_correctly(self) -> None:
        model = _make_mock_model(["ok"])

        messages = [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "reply"},
            {"role": "user", "content": "second"},
        ]

        with patch("app.services.gemini._get_model", return_value=model):
            _ = [c async for c in chat_stream(messages)]

        start_chat_kwargs = model.start_chat.call_args.kwargs
        history = start_chat_kwargs["history"]
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[1]["role"] == "model"

    @pytest.mark.asyncio
    async def test_error_yields_error_message(self) -> None:
        model = MagicMock()
        mock_chat = MagicMock()
        mock_chat.send_message.side_effect = RuntimeError("API down")
        model.start_chat.return_value = mock_chat

        with patch("app.services.gemini._get_model", return_value=model):
            chunks = [c async for c in chat_stream([{"role": "user", "content": "hi"}])]

        assert len(chunks) == 1
        assert "error" in chunks[0].lower()

    @pytest.mark.asyncio
    async def test_empty_chunk_text_skipped(self) -> None:
        chunk_with_text = MagicMock()
        chunk_with_text.text = "visible"
        chunk_without = MagicMock()
        chunk_without.text = ""

        mock_response = MagicMock()
        mock_response.__iter__ = MagicMock(return_value=iter([chunk_with_text, chunk_without]))

        mock_chat = MagicMock()
        mock_chat.send_message.return_value = mock_response

        model = MagicMock()
        model.start_chat.return_value = mock_chat

        with patch("app.services.gemini._get_model", return_value=model):
            chunks = [c async for c in chat_stream([{"role": "user", "content": "hi"}])]

        assert chunks == ["visible"]
