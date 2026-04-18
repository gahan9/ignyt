"""Cross-cutting Pydantic models (health, errors, budget snapshot)."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Shape of `/health`."""

    status: str = Field(description="Always `healthy` when served.")
    service: str = Field(description="Service identifier for multi-service ingress.")


class ErrorResponse(BaseModel):
    """Standard FastAPI error envelope for all 4xx / 5xx responses."""

    detail: str = Field(description="Human-readable error description.")


class BudgetStatus(BaseModel):
    """Shape of `/api/v1/budget`."""

    gemini_used: int = Field(
        ge=0,
        description="Gemini API calls made today (UTC). Resets at midnight.",
    )
    gemini_limit: int = Field(
        ge=0,
        description="Daily cap beyond which `/concierge/chat` returns 429.",
    )
    vision_used: int = Field(
        ge=0,
        description="Vision API calls made today (UTC). Resets at midnight.",
    )
    vision_limit: int = Field(
        ge=0,
        description="Daily cap beyond which `/photos/label` returns 429.",
    )
