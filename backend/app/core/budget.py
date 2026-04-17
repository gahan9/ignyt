from datetime import date

import structlog

from app.core.config import settings

logger = structlog.get_logger()


class CostGuard:
    """In-memory daily counters that enforce the $3 budget cap.

    Resets automatically at midnight. For a hackathon demo this is
    sufficient — production would use Redis or Firestore counters.
    """

    def __init__(self) -> None:
        self._gemini_count: int = 0
        self._vision_count: int = 0
        self._reset_date: date = date.today()

    def _maybe_reset(self) -> None:
        if date.today() != self._reset_date:
            logger.info(
                "cost_guard_daily_reset",
                prev_gemini=self._gemini_count,
                prev_vision=self._vision_count,
            )
            self._gemini_count = 0
            self._vision_count = 0
            self._reset_date = date.today()

    def check_gemini(self) -> bool:
        self._maybe_reset()
        return self._gemini_count < settings.daily_gemini_requests

    def record_gemini(self) -> None:
        self._gemini_count += 1
        logger.info(
            "gemini_call_recorded",
            count=self._gemini_count,
            limit=settings.daily_gemini_requests,
        )

    def check_vision(self) -> bool:
        self._maybe_reset()
        return self._vision_count < settings.daily_vision_calls

    def record_vision(self) -> None:
        self._vision_count += 1
        logger.info(
            "vision_call_recorded",
            count=self._vision_count,
            limit=settings.daily_vision_calls,
        )

    @property
    def status(self) -> dict[str, int]:
        self._maybe_reset()
        return {
            "gemini_used": self._gemini_count,
            "gemini_limit": settings.daily_gemini_requests,
            "vision_used": self._vision_count,
            "vision_limit": settings.daily_vision_calls,
        }


cost_guard = CostGuard()
