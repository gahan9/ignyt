from fastapi import APIRouter

from app.core.budget import cost_guard
from app.models.common import BudgetStatus

router = APIRouter(prefix="/api/v1")


@router.get("/budget", response_model=BudgetStatus)
async def get_budget_status() -> dict[str, int]:
    """Returns current daily usage vs limits for cost-controlled services."""
    return cost_guard.status
