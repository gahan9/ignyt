"""Concierge chat endpoints (Gemini-backed streaming)."""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.recaptcha import verify_recaptcha
from app.core.security import get_current_user
from app.models.common import ErrorResponse
from app.models.concierge import ConciergeRequest
from app.services.gemini import chat_stream

router = APIRouter(prefix="/concierge", tags=["concierge"])


@router.post(
    "/chat",
    summary="Streamed AI concierge chat (Gemini 2.0 Flash)",
    description=(
        "Sends a conversation history to Gemini 2.0 Flash and streams the "
        "response back as plain-text chunks over a single HTTP response "
        "body (like SSE but simpler — the client just reads the stream "
        "until EOF).\n\n"
        "The conversation is bounded by Pydantic validation: at most 20 "
        "messages per request, each 1..2000 characters, role in "
        "`{'user', 'assistant'}`. Requests counting against the daily "
        "Gemini CostGuard quota.\n\n"
        "The response media type is `text/plain`; charset is UTF-8. Each "
        "read from the stream yields a partial token sequence — clients "
        "concatenate as they arrive."
    ),
    responses={
        200: {
            "description": "Streamed text/plain response.",
            "content": {
                "text/plain": {
                    "example": (
                        "The opening keynote is in the Main Hall at 09:00. "
                        "Want me to add it to your schedule?"
                    )
                }
            },
        },
        401: {"model": ErrorResponse, "description": "Missing or invalid token."},
        422: {
            "model": ErrorResponse,
            "description": "Message validation failure (role, length, count).",
        },
        429: {
            "model": ErrorResponse,
            "description": "Daily Gemini budget exhausted.",
        },
    },
)
async def concierge_chat(
    body: ConciergeRequest,
    _user: dict[str, Any] = Depends(get_current_user),
    _recaptcha: dict[str, Any] | None = Depends(verify_recaptcha),
) -> StreamingResponse:
    """Stream an AI concierge response for the given conversation history."""
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    return StreamingResponse(
        chat_stream(messages),
        media_type="text/plain",
    )
