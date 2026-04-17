from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class ErrorResponse(BaseModel):
    detail: str


class BudgetStatus(BaseModel):
    gemini_used: int
    gemini_limit: int
    vision_used: int
    vision_limit: int
