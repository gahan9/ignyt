from pydantic import BaseModel, Field


class CheckInRequest(BaseModel):
    event_id: str
    attendee_id: str


class CheckInResponse(BaseModel):
    attendee_id: str
    name: str
    checked_in: bool
    message: str


class BadgeOcrRequest(BaseModel):
    event_id: str
    image_base64: str = Field(max_length=2_000_000)


class BadgeOcrResponse(BaseModel):
    detected_text: list[str]
    matched_attendee: str | None = None
    confidence: float = 0.0
