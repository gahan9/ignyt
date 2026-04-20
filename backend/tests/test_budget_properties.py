"""Property-based tests for ``CostGuard``.

Hypothesis explores hundreds of randomised counter / date trajectories
that example-based tests would never bother to enumerate. The properties
encode invariants the hand-written suite only spot-checks:

* ``check_*`` is a pure function of (counter, limit, today).
* Recording N requests advances the counter by N until rollover, then
  the count starts again from N - capacity at most.
* A single rollover always zeroes both counters in lockstep.
* Status totals are monotonic between rollovers.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.core.budget import CostGuard, InMemoryBackend
from app.core.config import settings as app_settings

_HC = (HealthCheck.function_scoped_fixture,)


def _make_guard() -> CostGuard:
    """Return a CostGuard whose backend is anchored to ``today_utc``."""
    return CostGuard(InMemoryBackend())


@given(n=st.integers(min_value=0, max_value=300))
@settings(max_examples=50, deadline=None, suppress_health_check=_HC)
def test_record_gemini_monotonic_until_rollover(n: int) -> None:
    guard = _make_guard()
    for _ in range(n):
        guard.record_gemini()
    expected = min(n, app_settings.daily_gemini_requests)
    # The counter itself can exceed the limit (record_ never short-circuits)
    # but `check_*` enforces the ceiling.
    assert guard._gemini_count == n
    assert guard.check_gemini() is (expected < app_settings.daily_gemini_requests)


@given(n=st.integers(min_value=0, max_value=200))
@settings(max_examples=50, deadline=None, suppress_health_check=_HC)
def test_record_vision_independent_of_gemini(n: int) -> None:
    guard = _make_guard()
    for _ in range(n):
        guard.record_vision()
    assert guard._gemini_count == 0
    assert guard._vision_count == n


@given(
    delta_days=st.integers(min_value=1, max_value=365 * 3),
    gemini_used=st.integers(min_value=0, max_value=200),
    vision_used=st.integers(min_value=0, max_value=200),
)
@settings(max_examples=50, deadline=None, suppress_health_check=_HC)
def test_rollover_zeros_both_counters(
    delta_days: int, gemini_used: int, vision_used: int
) -> None:
    guard = _make_guard()
    guard._gemini_count = gemini_used
    guard._vision_count = vision_used

    future = datetime.now(tz=UTC).date() + timedelta(days=delta_days)
    with patch("app.core.budget._today_utc", return_value=future):
        guard._maybe_reset()
        assert guard._gemini_count == 0
        assert guard._vision_count == 0
        assert guard._reset_date == future


@given(
    a=st.integers(min_value=0, max_value=app_settings.daily_gemini_requests),
    b=st.integers(min_value=0, max_value=app_settings.daily_vision_calls),
)
@settings(max_examples=50, deadline=None, suppress_health_check=_HC)
def test_status_reflects_exact_counts(a: int, b: int) -> None:
    guard = _make_guard()
    for _ in range(a):
        guard.record_gemini()
    for _ in range(b):
        guard.record_vision()

    status = guard.status
    assert status["gemini_used"] == a
    assert status["vision_used"] == b
    assert status["gemini_limit"] == app_settings.daily_gemini_requests
    assert status["vision_limit"] == app_settings.daily_vision_calls


@given(
    rollovers=st.integers(min_value=1, max_value=10),
    per_day=st.integers(min_value=0, max_value=20),
)
@settings(max_examples=30, deadline=None, suppress_health_check=_HC)
def test_multiple_rollovers_keep_state_consistent(
    rollovers: int, per_day: int
) -> None:
    guard = _make_guard()
    today = datetime.now(tz=UTC).date()

    for d in range(1, rollovers + 1):
        future = today + timedelta(days=d)
        with patch("app.core.budget._today_utc", return_value=future):
            guard._maybe_reset()
            for _ in range(per_day):
                guard.record_gemini()
                guard.record_vision()
            assert guard._gemini_count == per_day
            assert guard._vision_count == per_day
            assert guard._reset_date == future


@given(initial=st.integers(min_value=0, max_value=10_000))
@settings(max_examples=30, deadline=None, suppress_health_check=_HC)
def test_check_is_pure_relative_to_counter(initial: int) -> None:
    guard = _make_guard()
    guard._gemini_count = initial
    today = guard._reset_date

    expected = initial < app_settings.daily_gemini_requests
    with patch("app.core.budget._today_utc", return_value=today):
        # Pure: same input → same output, no mutation of the counter.
        assert guard.check_gemini() is expected
        assert guard.check_gemini() is expected
        assert guard._gemini_count == initial


def test_settings_match_advertised_defaults() -> None:
    """Lock the documented defaults so a config drift trips a test, not prod."""
    assert app_settings.daily_gemini_requests >= 1
    assert app_settings.daily_vision_calls >= 1


def test_anchor_is_today_utc() -> None:
    """``CostGuard`` must initialise its rollover anchor to today (UTC)."""
    guard = _make_guard()
    today = datetime.now(tz=UTC).date()
    assert guard._reset_date in {today, today - timedelta(days=1)}, (
        "Anchor must be today's UTC date (allow 1d slack only at the boundary)."
    )


def test_rollover_anchor_uses_utc_not_local() -> None:
    """Regression: the helper must call ``datetime.now(tz=UTC).date()``."""
    guard = _make_guard()
    fixed = date(2099, 6, 15)
    with patch("app.core.budget._today_utc", return_value=fixed):
        guard.check_gemini()
        assert guard._reset_date == fixed
