"""In-process daily budget counters (the ``$3/day`` CostGuard).

Tracks per-day Gemini and Vision API call counts with automatic UTC
midnight rollover. Single-process semantics are sufficient for the
hackathon demo; a multi-replica production deployment should swap the
backing store for Redis or a Firestore document with a transaction.
"""

from datetime import UTC, date, datetime

import structlog

from app.core.config import settings

logger = structlog.get_logger()


def _today_utc() -> date:
    """Return today's UTC date — single source of truth for rollover."""
    return datetime.now(tz=UTC).date()


class CostGuard:
    """Daily counters that enforce per-service call budgets."""

    def __init__(self) -> None:
        """Initialise counters and anchor the rollover date to today (UTC)."""
        self._gemini_count: int = 0
        self._vision_count: int = 0
        self._reset_date: date = _today_utc()

    def _maybe_reset(self) -> None:
        """Reset all counters if the UTC date has rolled over since last check."""
        today = _today_utc()
        if today != self._reset_date:
            logger.info(
                "cost_guard_daily_reset",
                prev_gemini=self._gemini_count,
                prev_vision=self._vision_count,
            )
            self._gemini_count = 0
            self._vision_count = 0
            self._reset_date = today

    def check_gemini(self) -> bool:
        """Return ``True`` when the Gemini daily quota still has headroom."""
        self._maybe_reset()
        return self._gemini_count < settings.daily_gemini_requests

    def record_gemini(self) -> None:
        """Record one Gemini API call against the daily counter."""
        self._gemini_count += 1
        logger.info(
            "gemini_call_recorded",
            count=self._gemini_count,
            limit=settings.daily_gemini_requests,
        )

    def check_vision(self) -> bool:
        """Return ``True`` when the Vision daily quota still has headroom."""
        self._maybe_reset()
        return self._vision_count < settings.daily_vision_calls

    def record_vision(self) -> None:
        """Record one Vision API call against the daily counter."""
        self._vision_count += 1
        logger.info(
            "vision_call_recorded",
            count=self._vision_count,
            limit=settings.daily_vision_calls,
        )

    @property
    def status(self) -> dict[str, int]:
        """Snapshot of today's counters and limits (used by ``/budget``)."""
        self._maybe_reset()
        return {
            "gemini_used": self._gemini_count,
            "gemini_limit": settings.daily_gemini_requests,
            "vision_used": self._vision_count,
            "vision_limit": settings.daily_vision_calls,
        }


cost_guard = CostGuard()
