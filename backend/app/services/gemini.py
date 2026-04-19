"""Gemini concierge service.

Wraps the ``google.generativeai`` SDK to stream a chat response back to the
API layer, enforcing per-day budget caps via :mod:`app.core.budget`. The
system prompt and default event context live here as module constants so
they can be diffed and reviewed independently of code.

The Google AI SDK's ``send_message(stream=True)`` is a *blocking* call that
returns a synchronous iterator. We dispatch both the initial RPC and each
chunk pull through ``asyncio.to_thread`` so the FastAPI event loop stays
free to serve health checks and other concurrent requests while a chat
response is streaming.
"""

import asyncio
from collections.abc import AsyncGenerator, Iterator
from functools import lru_cache
from typing import Any, Final

import google.generativeai as genai
import structlog

from app.core.budget import cost_guard
from app.core.config import settings

logger = structlog.get_logger()

GEMINI_MODEL_NAME: Final[str] = "gemini-2.0-flash"
GEMINI_TEMPERATURE: Final[float] = 0.7

BUDGET_EXHAUSTED_MESSAGE: Final[str] = (
    "I've reached my daily conversation limit to stay within budget. Please try again tomorrow!"
)
GENERIC_ERROR_MESSAGE: Final[str] = "Sorry, I encountered an error. Please try again."

EVENT_SYSTEM_PROMPT = """You are Ignyt AI, a helpful concierge for a live physical event.

You know the event schedule, venue layout, and speaker bios provided below.
Answer attendee questions about sessions, timing, directions, networking, and
general event logistics. Be concise, friendly, and accurate.

If you don't know the answer, say so honestly — never fabricate session times
or speaker names.

--- EVENT CONTEXT ---
{event_context}
--- END CONTEXT ---
"""

DEFAULT_EVENT_CONTEXT = """Event: Ignyt Demo Day
Date: Today
Venue: Innovation Hub, Main Campus

Sessions:
- 09:00 Opening Keynote — Main Hall — Dr. Sarah Chen (AI & Society)
- 10:30 Building on GCP — Room A — Marcus Johnson (Cloud Architecture)
- 13:00 Hands-on Workshop: Gemini API — Room B — Priya Patel
- 15:00 Demo Showcase — Main Hall — All Teams
- 16:30 Closing & Awards — Main Hall

Facilities:
- Wi-Fi: network "Ignyt", password on your badge
- Lunch: 12:00–13:00 in the Atrium
- Restrooms: ground floor near elevators
- Help Desk: lobby entrance
"""


@lru_cache(maxsize=1)
def _get_model() -> Any:
    """Lazily configure the SDK and instantiate (memoised) the Gemini model.

    ``lru_cache`` is preferred over a hand-rolled module-level ``global``:
    it is thread-safe, has explicit ``cache_clear()`` semantics that tests
    can invoke (no need to ``patch`` a module attribute), and removes the
    "forgot ``global``" footgun. The cached return type is ``Any`` because
    ``genai.GenerativeModel`` is built from proto definitions at runtime
    and the SDK ships no static type for it.
    """
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL_NAME,
        system_instruction=EVENT_SYSTEM_PROMPT.format(event_context=DEFAULT_EVENT_CONTEXT),
        generation_config=genai.GenerationConfig(
            max_output_tokens=settings.max_tokens_per_request,
            temperature=GEMINI_TEMPERATURE,
        ),
    )


async def chat_stream(
    messages: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Stream a Gemini response, yielding text chunks.

    Args:
        messages: Conversation history in oldest-first order. Each entry
            has ``role`` (``"user"`` or ``"assistant"``) and ``content``.
            The last entry is treated as the prompt; everything before it
            becomes the chat history. Pydantic validation in the API
            layer guarantees shape and length.

    Yields:
        Plain-text chunks of the model response. On budget exhaustion or
        upstream error, yields a single user-facing fallback message
        instead of raising — the streaming response always completes.
    """
    if not cost_guard.check_gemini():
        yield BUDGET_EXHAUSTED_MESSAGE
        return

    model = _get_model()

    history: list[dict[str, Any]] = []
    for msg in messages[:-1]:
        role = "user" if msg["role"] == "user" else "model"
        history.append({"role": role, "parts": [msg["content"]]})

    chat = model.start_chat(history=history)
    last_message = messages[-1]["content"] if messages else ""

    try:
        response = await asyncio.to_thread(chat.send_message, last_message, stream=True)
        cost_guard.record_gemini()

        # ``next()`` blocks until the SDK has the next chunk on the wire.
        # Hop to a worker thread per chunk so the event loop can interleave
        # other requests (health checks, parallel concierge sessions).
        chunk_iter: Iterator[Any] = iter(response)
        sentinel: object = object()
        while True:
            chunk = await asyncio.to_thread(next, chunk_iter, sentinel)
            if chunk is sentinel:
                break
            text = getattr(chunk, "text", "")
            if text:
                yield text
    except Exception:
        # Broad catch is intentional: a streaming response that raises
        # mid-flight breaks the FastAPI ``StreamingResponse`` contract
        # and the client sees a connection reset. Degrade to a polite
        # fallback message instead. ``logger.exception`` captures stack.
        logger.exception("gemini_stream_error")
        yield GENERIC_ERROR_MESSAGE
