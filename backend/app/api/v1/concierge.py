from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user
from app.models.concierge import ConciergeRequest
from app.services.gemini import chat_stream

router = APIRouter(prefix="/concierge", tags=["concierge"])


@router.post("/chat")
async def concierge_chat(
    body: ConciergeRequest,
    _user: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    """Stream an AI concierge response for the given conversation history."""
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    return StreamingResponse(
        chat_stream(messages),
        media_type="text/plain",
    )
