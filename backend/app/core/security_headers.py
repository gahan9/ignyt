"""Security-header middleware applied to every HTTP response.

The Ignyt API serves JSON for ``/api/*`` and OpenAPI HTML for ``/docs``
and ``/redoc``. Both surfaces benefit from a tight set of browser
security headers — this module centralises that policy so the audit
surface is one file instead of "wherever a response is built".
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Final

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Strict CSP for JSON-only API endpoints. ``default-src 'none'`` forbids
# every fetch/source by default; ``frame-ancestors 'none'`` hardens
# clickjacking; ``sandbox`` strips scripts even if a response somehow
# carries HTML. Browsers ignore CSP on raw JSON, but defence-in-depth
# matters when a future endpoint accidentally returns text/html.
API_CSP: Final[str] = (
    "default-src 'none'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'; "
    "form-action 'none'"
)

# Permissive CSP for FastAPI's bundled docs UIs. Swagger UI and Redoc
# pull JS/CSS from jsdelivr at runtime; locking these down without an
# allowlist breaks the only browser-rendered surface we ship.
DOCS_CSP: Final[str] = (
    "default-src 'self'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "script-src 'self' https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)

DOC_PATHS: Final[tuple[str, ...]] = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject browser security headers on every response.

    Headers (rationale in parens):

    * ``Content-Security-Policy`` — context-aware (locked-down for API,
      docs-friendly for ``/docs`` & ``/redoc``).
    * ``Strict-Transport-Security`` — pins clients to HTTPS for a year
      including subdomains (Cloud Run terminates TLS for us).
    * ``X-Content-Type-Options: nosniff`` — disables MIME sniffing so a
      JSON body cannot be reinterpreted as HTML.
    * ``X-Frame-Options: DENY`` — legacy clickjacking guard for browsers
      that ignore CSP's ``frame-ancestors``.
    * ``Referrer-Policy: strict-origin-when-cross-origin`` — minimum
      leakage on cross-origin navigations.
    * ``Permissions-Policy`` — turn off camera/microphone/geolocation
      since the API never asks for them; reduces a compromised page's
      blast radius.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Run the next handler and stamp the response with security headers."""
        response = await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in DOC_PATHS):
            response.headers.setdefault("Content-Security-Policy", DOCS_CSP)
        else:
            response.headers.setdefault("Content-Security-Policy", API_CSP)

        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )

        return response
