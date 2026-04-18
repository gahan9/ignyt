from pydantic import BaseModel, ConfigDict, Field


class CheckInRequest(BaseModel):
    """Payload for `POST /api/v1/checkin/scan`."""

    event_id: str = Field(
        description="Firestore event id (e.g. `demo-event`).",
        examples=["demo-event"],
    )
    attendee_id: str = Field(
        description="Attendee id encoded on the QR badge.",
        examples=["att-0001"],
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"event_id": "demo-event", "attendee_id": "att-0001"}]
        }
    )


class CheckInResponse(BaseModel):
    """Result of a check-in attempt."""

    attendee_id: str = Field(description="Echoes the checked-in attendee id.")
    name: str = Field(description="Attendee display name for UI rendering.")
    checked_in: bool = Field(
        description=(
            "Always `true` on 200 responses — `false` would imply a soft "
            "rejection, which we currently surface as HTTP errors instead."
        ),
    )
    message: str = Field(
        description="Human-readable status (e.g. 'Check-in successful!').",
    )


class BadgeOcrRequest(BaseModel):
    """Payload for `POST /api/v1/checkin/badge`."""

    event_id: str = Field(description="Firestore event id.", examples=["demo-event"])
    image_base64: str = Field(
        max_length=2_000_000,
        description=(
            "Badge photo encoded as base64. Hard cap of 2MB after encoding "
            "to keep a single request below Cloud Run's default 32MB body "
            "limit and Vision's own 20MB payload cap."
        ),
    )


class BadgeOcrResponse(BaseModel):
    """Vision OCR result plus the best attendee match."""

    detected_text: list[str] = Field(
        description="OCR'd text lines from the badge, in order.",
    )
    matched_attendee: str | None = Field(
        default=None,
        description=(
            "Attendee id that was matched (and automatically checked in). "
            "`null` when no line on the badge matched any roster entry."
        ),
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Heuristic match confidence in `[0, 1]`. Currently a fixed "
            "`0.85` on match and `0.0` on miss — will become a real score "
            "when we add fuzzy matching."
        ),
    )
