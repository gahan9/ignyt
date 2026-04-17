from collections.abc import AsyncGenerator
from typing import Any

import google.generativeai as genai
import structlog

from app.core.budget import cost_guard
from app.core.config import settings

logger = structlog.get_logger()

_model: Any = None

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


def _get_model() -> Any:
    global _model
    if _model is None:
        genai.configure(api_key=settings.gemini_api_key)
        _model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=EVENT_SYSTEM_PROMPT.format(
                event_context=DEFAULT_EVENT_CONTEXT
            ),
            generation_config=genai.GenerationConfig(
                max_output_tokens=settings.max_tokens_per_request,
                temperature=0.7,
            ),
        )
    return _model


async def chat_stream(
    messages: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Stream a Gemini response, yielding text chunks.

    Checks CostGuard before calling. Raises ValueError if budget exhausted.
    """
    if not cost_guard.check_gemini():
        yield "I've reached my daily conversation limit to stay within budget. Please try again tomorrow!"
        return

    model = _get_model()

    history = []
    for msg in messages[:-1]:
        role = "user" if msg["role"] == "user" else "model"
        history.append({"role": role, "parts": [msg["content"]]})

    chat = model.start_chat(history=history)
    last_message = messages[-1]["content"] if messages else ""

    try:
        response = chat.send_message(last_message, stream=True)
        cost_guard.record_gemini()

        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as exc:
        logger.error("gemini_stream_error", error=str(exc))
        yield "Sorry, I encountered an error. Please try again."
