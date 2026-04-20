"""Ignyt FastAPI application entrypoint.

Wires the v1 router, CORS middleware, OpenAPI metadata, and the
``/health`` liveness endpoint. Imported by both the Cloud Run runtime
(``uvicorn app.main:app``) and the OpenAPI export script.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.rate_limit import RateLimiterMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.models.common import HealthResponse

logger = structlog.get_logger()

OPENAPI_DESCRIPTION = """
Ignyt powers physical event experiences with real-time engagement, an AI
concierge, smart QR-based check-in, and a live photo board — all designed to
run within a **$3/day GCP budget** enforced by a CostGuard middleware.

## Auth

Every route under `/api/v1/*` requires a **Firebase ID token** in the
`Authorization: Bearer <token>` header. Tokens are obtained from Firebase
Auth on the client (`user.getIdToken()`).

## Budget controls

The `/api/v1/budget` endpoint exposes current usage vs. daily limits for
cost-controlled services (Gemini, Vision). When a service's daily quota is
exhausted, dependent endpoints return `429 Too Many Requests` until the
counter resets at UTC midnight.

## Error shape

All 4xx / 5xx responses follow the FastAPI default:

```json
{ "detail": "human-readable message" }
```
""".strip()

OPENAPI_TAGS = [
    {
        "name": "health",
        "description": "Liveness probe used by Cloud Run and load balancers.",
    },
    {
        "name": "budget",
        "description": "Daily usage counters for cost-controlled AI services.",
    },
    {
        "name": "checkin",
        "description": "Attendee check-in via QR scan or badge OCR.",
    },
    {
        "name": "concierge",
        "description": "Gemini-backed conversational assistant (streaming).",
    },
    {
        "name": "photos",
        "description": "Photo board: signed upload URLs and Vision label detection.",
    },
]


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    """FastAPI lifespan hook — emits structured startup/shutdown events."""
    logger.info("ignyt_api_starting", project=settings.gcp_project_id)
    yield
    logger.info("ignyt_api_shutdown")


app = FastAPI(
    title="Ignyt API",
    description=OPENAPI_DESCRIPTION,
    version="0.1.0",
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
    contact={
        "name": "Ignyt team",
        "url": "https://github.com/your-org/ignyt",
    },
    license_info={"name": "MIT"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# Per-identity throttle: protects billable Gemini/Vision endpoints from a
# single signed-in user (or a single IP) blowing the daily budget in
# seconds. Defaults give 60-token burst, 1 token/sec sustained — enough
# for normal interactive use but tight enough to stop a runaway loop.
# Disabled in tests via ``EP_RATE_LIMIT_ENABLED=false`` to keep the suite
# non-flaky.
if settings.rate_limit_enabled:
    app.add_middleware(
        RateLimiterMiddleware,
        capacity=settings.rate_limit_capacity,
        refill_per_sec=settings.rate_limit_refill_per_sec,
    )

# Outer-most middleware so headers are stamped on every response, including
# the CORS pre-flight responses produced above.
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(v1_router)


@app.get(
    "/health",
    tags=["health"],
    response_model=HealthResponse,
    summary="Liveness probe",
    description=(
        "Returns 200 if the FastAPI process is serving requests. Does not "
        "verify downstream dependencies (Firestore/Gemini/Vision) — use "
        "`/api/v1/budget` for a richer health signal."
    ),
    responses={
        200: {
            "description": "Service is up.",
            "content": {
                "application/json": {"example": {"status": "healthy", "service": "ignyt-api"}}
            },
        }
    },
)
async def health_check() -> HealthResponse:
    """Return a static healthy response (Cloud Run liveness probe)."""
    return HealthResponse(status="healthy", service="ignyt-api")
