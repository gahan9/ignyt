from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class ConciergeRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=20)
