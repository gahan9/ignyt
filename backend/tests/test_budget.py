from datetime import date
from unittest.mock import patch

from app.core.budget import CostGuard


class TestCostGuardGemini:
    def test_check_gemini_initially_allowed(self, fresh_cost_guard: CostGuard) -> None:
        assert fresh_cost_guard.check_gemini() is True

    def test_check_gemini_blocked_at_limit(self, fresh_cost_guard: CostGuard) -> None:
        fresh_cost_guard._gemini_count = 100
        assert fresh_cost_guard.check_gemini() is False

    def test_record_gemini_increments(self, fresh_cost_guard: CostGuard) -> None:
        assert fresh_cost_guard._gemini_count == 0
        fresh_cost_guard.record_gemini()
        assert fresh_cost_guard._gemini_count == 1
        fresh_cost_guard.record_gemini()
        assert fresh_cost_guard._gemini_count == 2

    def test_gemini_exhaustion_flow(self, fresh_cost_guard: CostGuard) -> None:
        for _ in range(100):
            assert fresh_cost_guard.check_gemini() is True
            fresh_cost_guard.record_gemini()

        assert fresh_cost_guard.check_gemini() is False


class TestCostGuardVision:
    def test_check_vision_initially_allowed(self, fresh_cost_guard: CostGuard) -> None:
        assert fresh_cost_guard.check_vision() is True

    def test_check_vision_blocked_at_limit(self, fresh_cost_guard: CostGuard) -> None:
        fresh_cost_guard._vision_count = 50
        assert fresh_cost_guard.check_vision() is False

    def test_record_vision_increments(self, fresh_cost_guard: CostGuard) -> None:
        fresh_cost_guard.record_vision()
        assert fresh_cost_guard._vision_count == 1

    def test_vision_exhaustion_flow(self, fresh_cost_guard: CostGuard) -> None:
        for _ in range(50):
            assert fresh_cost_guard.check_vision() is True
            fresh_cost_guard.record_vision()

        assert fresh_cost_guard.check_vision() is False


class TestCostGuardDailyReset:
    def test_resets_on_date_change(self, fresh_cost_guard: CostGuard) -> None:
        # Production reads the rollover boundary from ``_today_utc`` rather
        # than ``date.today``; patching the helper is the only way to drive
        # the reset branch in ``_maybe_reset``. The previous patch on
        # ``app.core.budget.date`` was a no-op because ``_today_utc`` calls
        # ``datetime.now(tz=UTC).date()`` and never touches the class.
        fresh_cost_guard.record_gemini()
        fresh_cost_guard.record_vision()
        assert fresh_cost_guard._gemini_count == 1
        assert fresh_cost_guard._vision_count == 1

        tomorrow = date(2099, 1, 1)
        with patch("app.core.budget._today_utc", return_value=tomorrow):
            assert fresh_cost_guard.check_gemini() is True
            assert fresh_cost_guard._gemini_count == 0
            assert fresh_cost_guard._vision_count == 0
            assert fresh_cost_guard._reset_date == tomorrow

    def test_no_reset_same_day(self, fresh_cost_guard: CostGuard) -> None:
        fresh_cost_guard.record_gemini()
        fresh_cost_guard.check_gemini()
        assert fresh_cost_guard._gemini_count == 1


class TestCostGuardStatus:
    def test_status_keys(self, fresh_cost_guard: CostGuard) -> None:
        status = fresh_cost_guard.status
        assert set(status.keys()) == {
            "gemini_used",
            "gemini_limit",
            "vision_used",
            "vision_limit",
        }

    def test_status_reflects_usage(self, fresh_cost_guard: CostGuard) -> None:
        fresh_cost_guard.record_gemini()
        fresh_cost_guard.record_gemini()
        fresh_cost_guard.record_vision()

        status = fresh_cost_guard.status
        assert status["gemini_used"] == 2
        assert status["vision_used"] == 1
        assert status["gemini_limit"] == 100
        assert status["vision_limit"] == 50
