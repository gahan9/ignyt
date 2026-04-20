"""Contract-drift tests between the frontend client and the FastAPI server.

These tests prevent the silent regression where a backend route is renamed
(e.g. ``/v1/checkin/scan`` -> ``/v1/checkin/verify``) but the frontend still
hits the old path. That bug shows up as a 404 at runtime and isn't caught by
any unit test on either side in isolation.

Approach:
1. Materialize the live OpenAPI schema from ``app.main:app``.
2. Static-grep the frontend source tree for every literal endpoint passed to
   ``apiGet``, ``apiPost``, or ``apiStreamPost``.
3. Assert every referenced path is present in the schema.

The tests are conservative: they accept FastAPI's path-parameter syntax
(``{id}``) as equivalent to concrete values in the frontend call site.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

# The frontend client concatenates every ``apiGet``/``apiPost``/``apiStreamPost``
# path against ``API_BASE`` (see ``frontend/src/lib/api.ts``), which defaults
# to ``/api``. Static grep of the source yields the bare path literal, so we
# reapply the same prefix here before matching against the OpenAPI schema.
FRONTEND_API_BASE_PREFIX = "/api"


# Matches:
#   apiPost<X>("/v1/...", ...)
#   apiPost("/v1/...", ...)
#   apiGet<X>("/v1/...")
#   apiStreamPost("/v1/...", ...)
_CLIENT_CALL_RE = re.compile(
    r"""api(?:Get|Post|StreamPost)\s*          # fn name
        (?:<[^>]*>)?                           # optional TS generic
        \s*\(                                  # opening paren
        \s*["'`]                               # opening quote
        (?P<path>/[^"'`]+)                     # path literal
        ["'`]                                  # closing quote
    """,
    re.VERBOSE,
)


def _frontend_api_paths() -> set[str]:
    paths: set[str] = set()
    if not FRONTEND_SRC.exists():
        pytest.skip(f"Frontend source not found at {FRONTEND_SRC}")
    for file in FRONTEND_SRC.rglob("*.ts*"):
        # Skip tests and node_modules.
        if "__tests__" in file.parts or "node_modules" in file.parts:
            continue
        text = file.read_text(encoding="utf-8", errors="ignore")
        for match in _CLIENT_CALL_RE.finditer(text):
            paths.add(match.group("path"))
    return paths


def _matches_any_openapi_path(call_path: str, schema_paths: set[str]) -> bool:
    """Return True if *call_path* corresponds to any path in the OpenAPI schema.

    The frontend always calls concrete paths; the OpenAPI schema uses
    ``{placeholder}`` for path params. Convert each schema template into a
    regex and match.
    """
    if call_path in schema_paths:
        return True
    for template in schema_paths:
        pattern = "^" + re.sub(r"\{[^}]+\}", r"[^/]+", template) + "$"
        if re.match(pattern, call_path):
            return True
    return False


@pytest.fixture(scope="module")
def openapi_paths() -> set[str]:
    schema = app.openapi()
    return set(schema.get("paths", {}).keys())


def test_frontend_paths_are_defined_in_openapi(openapi_paths: set[str]) -> None:
    """Every path the frontend calls must be served by the backend."""
    frontend_paths = _frontend_api_paths()

    assert frontend_paths, (
        "Frontend grep returned no API calls -- either the regex broke or "
        "the call sites moved. Update _CLIENT_CALL_RE in test_contract.py."
    )

    unknown = [
        p
        for p in frontend_paths
        if not _matches_any_openapi_path(FRONTEND_API_BASE_PREFIX + p, openapi_paths)
    ]
    assert not unknown, (
        "Frontend calls these endpoints that do NOT exist in the backend "
        f"OpenAPI schema: {sorted(unknown)}. Either the route was renamed "
        "server-side or the frontend is calling a ghost endpoint."
    )


def test_openapi_has_expected_core_endpoints(openapi_paths: set[str]) -> None:
    """Lock in the handful of endpoints the demo flows depend on."""
    required = {
        "/api/v1/checkin/scan",
        "/api/v1/checkin/badge",
        "/api/v1/concierge/chat",
        "/api/v1/photos/upload-url",
        "/api/v1/photos/label",
        "/health",
    }
    missing = required - openapi_paths
    assert not missing, (
        f"Core endpoints removed from OpenAPI schema: {sorted(missing)}. "
        "If this is intentional, update test_contract.py and also remove "
        "the matching frontend call site."
    )


def test_auth_endpoints_require_authorization_header(openapi_paths: set[str]) -> None:
    """Every non-public endpoint should require an Authorization header.

    ``get_current_user`` is implemented as a ``Header(...)`` dependency rather
    than HTTPBearer, so FastAPI surfaces it as a required header parameter in
    the OpenAPI schema. This tripwire fires if somebody accidentally removes
    the auth dependency from a protected route.
    """
    schema = app.openapi()
    paths = schema.get("paths", {})

    public = {"/health", "/api/v1/budget"}
    leaks: list[str] = []

    for path, ops in paths.items():
        if path in public:
            continue
        for method, op in ops.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            params = op.get("parameters", [])
            has_auth_header = any(
                p.get("in") == "header"
                and p.get("name", "").lower() == "authorization"
                and p.get("required") is True
                for p in params
            )
            if not has_auth_header:
                leaks.append(f"{method.upper()} {path}")

    assert not leaks, (
        "These routes do not require an Authorization header in OpenAPI: "
        f"{leaks}. Either add Depends(get_current_user) or add them to the "
        "`public` allowlist if they are intentionally open."
    )
