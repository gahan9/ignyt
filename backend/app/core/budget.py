"""Daily budget counters (the ``$3/day`` CostGuard).

Tracks per-day Gemini and Vision API call counts with automatic UTC
midnight rollover.

Storage is pluggable via :class:`CostGuardBackend`. The default
:class:`InMemoryBackend` gives single-process semantics that are fine for
the hackathon demo. A multi-replica production deployment should swap in
a shared backend (Redis, Memcached, or a Firestore document with a
transaction) by passing it to ``CostGuard(backend=...)``.

To plug in Redis later, implement ``CostGuardBackend`` against a Redis
hash (``HINCRBY`` for atomic ``record_*``, ``HGET`` for ``check_*``) and
either replace the module-level ``cost_guard`` singleton at startup or
inject it via FastAPI dependencies.
"""

from abc import ABC, abstractmethod
from datetime import UTC, date, datetime

import structlog

from app.core.config import settings

logger = structlog.get_logger()


def _today_utc() -> date:
    """Return today's UTC date — single source of truth for rollover."""
    return datetime.now(tz=UTC).date()


class CostGuardBackend(ABC):
    """Storage abstraction for per-day API call counters.

    All methods must be cheap and side-effect-free aside from the
    counter mutation they advertise. Implementations are expected to be
    safe for the deployment topology (in-memory for single replica,
    Redis/Firestore for multi-replica).
    """

    @abstractmethod
    def get_gemini(self) -> int:
        """Return the current Gemini call count for the active day."""

    @abstractmethod
    def set_gemini(self, value: int) -> None:
        """Set the Gemini call count (used by the rollover reset)."""

    @abstractmethod
    def incr_gemini(self) -> int:
        """Atomically add 1 to the Gemini counter and return the new value."""

    @abstractmethod
    def get_vision(self) -> int:
        """Return the current Vision call count for the active day."""

    @abstractmethod
    def set_vision(self, value: int) -> None:
        """Set the Vision call count (used by the rollover reset)."""

    @abstractmethod
    def incr_vision(self) -> int:
        """Atomically add 1 to the Vision counter and return the new value."""

    @abstractmethod
    def get_reset_date(self) -> date:
        """Return the UTC date the counters were last reset on."""

    @abstractmethod
    def set_reset_date(self, value: date) -> None:
        """Set the UTC reset date (called on midnight rollover)."""


class InMemoryBackend(CostGuardBackend):
    """Process-local counter storage.

    Single source of truth: three plain Python ints / dates. Suitable for
    one Cloud Run instance. For multi-instance deployments swap to a
    Redis-backed implementation that shares state across replicas.
    """

    def __init__(self) -> None:
        """Initialise the counters at zero and stamp today's UTC reset date."""
        self._gemini = 0
        self._vision = 0
        self._reset_date = _today_utc()

    def get_gemini(self) -> int:  # noqa: D102 -- ABC-docstring inherited
        return self._gemini

    def set_gemini(self, value: int) -> None:  # noqa: D102
        self._gemini = value

    def incr_gemini(self) -> int:  # noqa: D102
        self._gemini += 1
        return self._gemini

    def get_vision(self) -> int:  # noqa: D102
        return self._vision

    def set_vision(self, value: int) -> None:  # noqa: D102
        self._vision = value

    def incr_vision(self) -> int:  # noqa: D102
        self._vision += 1
        return self._vision

    def get_reset_date(self) -> date:  # noqa: D102
        return self._reset_date

    def set_reset_date(self, value: date) -> None:  # noqa: D102
        self._reset_date = value


class CostGuard:
    """Daily counters that enforce per-service call budgets."""

    def __init__(self, backend: CostGuardBackend | None = None) -> None:
        """Initialise with an injectable backend (default: in-memory)."""
        self._backend: CostGuardBackend = backend or InMemoryBackend()

    # -- backward-compat property proxies --------------------------------
    # Existing tests (and the few production callers) reach into these
    # attributes by name. Keeping them as properties means we can swap the
    # storage backend without touching a single test.

    @property
    def _gemini_count(self) -> int:
        return self._backend.get_gemini()

    @_gemini_count.setter
    def _gemini_count(self, value: int) -> None:
        self._backend.set_gemini(value)

    @property
    def _vision_count(self) -> int:
        return self._backend.get_vision()

    @_vision_count.setter
    def _vision_count(self, value: int) -> None:
        self._backend.set_vision(value)

    @property
    def _reset_date(self) -> date:
        return self._backend.get_reset_date()

    @_reset_date.setter
    def _reset_date(self, value: date) -> None:
        self._backend.set_reset_date(value)

    # -- public API -----------------------------------------------------

    def _maybe_reset(self) -> None:
        """Reset all counters if the UTC date has rolled over since last check."""
        today = _today_utc()
        if today != self._backend.get_reset_date():
            logger.info(
                "cost_guard_daily_reset",
                prev_gemini=self._backend.get_gemini(),
                prev_vision=self._backend.get_vision(),
            )
            self._backend.set_gemini(0)
            self._backend.set_vision(0)
            self._backend.set_reset_date(today)

    def check_gemini(self) -> bool:
        """Return ``True`` when the Gemini daily quota still has headroom."""
        self._maybe_reset()
        return self._backend.get_gemini() < settings.daily_gemini_requests

    def record_gemini(self) -> None:
        """Record one Gemini API call against the daily counter."""
        new = self._backend.incr_gemini()
        logger.info(
            "gemini_call_recorded",
            count=new,
            limit=settings.daily_gemini_requests,
        )

    def check_vision(self) -> bool:
        """Return ``True`` when the Vision daily quota still has headroom."""
        self._maybe_reset()
        return self._backend.get_vision() < settings.daily_vision_calls

    def record_vision(self) -> None:
        """Record one Vision API call against the daily counter."""
        new = self._backend.incr_vision()
        logger.info(
            "vision_call_recorded",
            count=new,
            limit=settings.daily_vision_calls,
        )

    @property
    def status(self) -> dict[str, int]:
        """Snapshot of today's counters and limits (used by ``/budget``)."""
        self._maybe_reset()
        return {
            "gemini_used": self._backend.get_gemini(),
            "gemini_limit": settings.daily_gemini_requests,
            "vision_used": self._backend.get_vision(),
            "vision_limit": settings.daily_vision_calls,
        }


cost_guard = CostGuard()
