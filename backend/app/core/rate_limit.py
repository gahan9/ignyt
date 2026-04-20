"""Per-identity token-bucket rate limiter middleware.

The CostGuard keeps the daily Gemini/Vision spend bounded, but it does
nothing to stop a single signed-in user from burning the entire daily
budget in one minute. This middleware adds an in-process token-bucket
that throttles per-identity request rate before the API contacts any
billable service.

Identity selection (best-effort, no token verification):

1. ``Authorization: Bearer <jwt>`` → SHA-256 of the token bytes. Hashing
   keeps the raw token out of the in-memory dict so a debugger or core
   dump never leaks a credential.
2. Else → ``X-Forwarded-For`` first hop (Cloud Run / GCLB injects this).
3. Else → ``request.client.host``.

Bucket parameters are read from settings so they can be tuned per
environment without redeploying middleware code.

Single-process semantics — OK for one Cloud Run instance and a hackathon
demo. Multi-replica deployments should swap the in-memory state for the
same Redis backend that ``CostGuard`` would use in production.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Awaitable, Callable
from threading import Lock
from typing import Final

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger()

# Paths that bypass the limiter entirely. Liveness probes from Cloud Run
# would otherwise consume tokens and flap the bucket; the budget endpoint
# is read-only and already has its own ``Cache-Control``.
_BYPASS_PREFIXES: Final[tuple[str, ...]] = (
    "/health",
    "/api/v1/budget",
    "/docs",
    "/redoc",
    "/openapi.json",
)


class TokenBucket:
    """Classic token-bucket: ``capacity`` tokens, refill at ``refill_per_sec``."""

    __slots__ = ("_last_refill", "_lock", "_tokens", "capacity", "refill_per_sec")

    def __init__(self, capacity: int, refill_per_sec: float) -> None:
        """Initialise the bucket full (``capacity`` tokens available)."""
        self.capacity = float(capacity)
        self.refill_per_sec = refill_per_sec
        self._tokens = float(capacity)
        self._last_refill = time.monotonic()
        self._lock = Lock()

    def take(self, n: int = 1) -> bool:
        """Try to take *n* tokens; return ``True`` on success."""
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            self._tokens = min(
                self.capacity,
                self._tokens + elapsed * self.refill_per_sec,
            )
            self._last_refill = now
            if self._tokens >= n:
                self._tokens -= n
                return True
            return False


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Per-identity token-bucket throttle.

    Args:
        app: ASGI app to wrap.
        capacity: Maximum burst per identity. Default 60 ≈ 1 req/s steady
            state with a 60-request burst tolerance.
        refill_per_sec: Sustained refill rate. Default 1.0 token/sec.
        max_buckets: Soft cap on how many distinct identities we track.
            When exceeded, the oldest entries are evicted in chunks to
            avoid an unbounded dict from a credential-stuffing attack.
    """

    def __init__(
        self,
        app: object,
        *,
        capacity: int = 60,
        refill_per_sec: float = 1.0,
        max_buckets: int = 10_000,
    ) -> None:
        """Configure the per-identity throttle and its backing dict."""
        super().__init__(app)  # type: ignore[arg-type]
        self._capacity = capacity
        self._refill = refill_per_sec
        self._max_buckets = max_buckets
        self._buckets: dict[str, TokenBucket] = {}
        self._dict_lock = Lock()

    @staticmethod
    def _identity_key(request: Request) -> str:
        """Derive a per-request identity key (hashed JWT or client IP)."""
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[len("bearer ") :].strip()
            if token:
                # Hash so the raw JWT never sits in process memory keyed
                # like a credential. ``shake_128`` is fine here — we only
                # need a stable, collision-resistant short key.
                return "u:" + hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]

        fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if fwd:
            return "ip:" + fwd

        client = request.client
        return "ip:" + (client.host if client else "unknown")

    def _get_bucket(self, key: str) -> TokenBucket:
        with self._dict_lock:
            bucket = self._buckets.get(key)
            if bucket is not None:
                return bucket

            if len(self._buckets) >= self._max_buckets:
                # Evict the oldest 10% to keep the dict bounded under
                # adversarial fan-out without doing per-request LRU.
                drop = max(1, self._max_buckets // 10)
                for victim in list(self._buckets.keys())[:drop]:
                    del self._buckets[victim]
                logger.info("rate_limit_buckets_evicted", count=drop)

            bucket = TokenBucket(self._capacity, self._refill)
            self._buckets[key] = bucket
            return bucket

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Admit or 429 each request based on the identity's bucket state."""
        path = request.url.path
        if any(path.startswith(p) for p in _BYPASS_PREFIXES):
            return await call_next(request)

        key = self._identity_key(request)
        bucket = self._get_bucket(key)
        if not bucket.take():
            logger.warning("rate_limit_exceeded", key_kind=key.split(":", 1)[0], path=path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": "1"},
            )

        return await call_next(request)
