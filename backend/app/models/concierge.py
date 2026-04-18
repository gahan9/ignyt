"""Pydantic schemas for ``/api/v1/concierge/*`` endpoints."""

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageIn(BaseModel):
    """A single turn in the concierge conversation."""

    role: str = Field(
        pattern="^(user|assistant)$",
        description=(
            "Turn speaker. Only `user` and `assistant` are accepted; "
            "`system` prompts are injected server-side."
        ),
        examples=["user", "assistant"],
    )
    content: str = Field(
        min_length=1,
        max_length=2000,
        description="Message body. Enforced to 1..2000 characters.",
    )


class ConciergeRequest(BaseModel):
    """Payload for `POST /api/v1/concierge/chat`."""

    messages: list[ChatMessageIn] = Field(
        min_length=1,
        max_length=20,
        description=(
            "Conversation history. At most 20 turns per request — older "
            "turns should be summarized client-side before resubmission."
        ),
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "messages": [
                        {"role": "user", "content": "When is the keynote?"},
                    ]
                }
            ]
        }
    )
