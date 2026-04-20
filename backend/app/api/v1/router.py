"""Composite v1 API router.

Mounts the per-feature routers under ``/api/v1`` and exposes the
``/api/v1/budget`` introspection endpoint.
"""

from fastapi import APIRouter, Response

from app.api.v1.checkin import router as checkin_router
from app.api.v1.concierge import router as concierge_router
from app.api.v1.photos import router as photos_router
from app.core.budget import cost_guard
from app.models.common import BudgetStatus

# Keep the budget snapshot fresh enough that a polling client sees the
# CostGuard tripping in near-real-time, but stale enough that 100 dashboard
# tabs hammering ``/budget`` per second don't punch through to in-process
# state. 10s is the standard ``cdn-friendly`` window for low-volume status
# endpoints.
_BUDGET_CACHE_SECONDS = 10

router = APIRouter(prefix="/api/v1")
router.include_router(checkin_router)
router.include_router(concierge_router)
router.include_router(photos_router)


@router.get(
    "/budget",
    response_model=BudgetStatus,
    tags=["budget"],
    summary="Get daily usage counters",
    description=(
        "Returns current daily usage vs limits for cost-controlled services "
        "(Gemini, Vision). Counters reset at UTC midnight. When a counter "
        "reaches its limit, the associated endpoint responds with "
        "`429 Too Many Requests` until the next reset."
    ),
    responses={
        200: {
            "description": "Current daily usage snapshot.",
            "content": {
                "application/json": {
                    "example": {
                        "gemini_used": 42,
                        "gemini_limit": 1000,
                        "vision_used": 7,
                        "vision_limit": 1000,
                    }
                }
            },
        }
    },
)
async def get_budget_status(response: Response) -> BudgetStatus:
    """Return current daily usage vs limits for cost-controlled services."""
    response.headers["Cache-Control"] = (
        f"public, max-age={_BUDGET_CACHE_SECONDS}, must-revalidate"
    )
    return BudgetStatus(**cost_guard.status)
