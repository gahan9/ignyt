from fastapi import APIRouter

from app.api.v1.checkin import router as checkin_router
from app.api.v1.concierge import router as concierge_router
from app.core.budget import cost_guard
from app.models.common import BudgetStatus

router = APIRouter(prefix="/api/v1")
router.include_router(checkin_router)
router.include_router(concierge_router)


@router.get("/budget", response_model=BudgetStatus)
async def get_budget_status() -> dict[str, int]:
    """Returns current daily usage vs limits for cost-controlled services."""
    return cost_guard.status
