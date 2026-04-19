"""Smoke tests for ``SecurityHeadersMiddleware``.

The middleware is a defensive layer; if it ever stops emitting these
headers we want to fail loudly in CI rather than discover the gap from
a security scanner weeks later.
"""

from fastapi.testclient import TestClient

from app.core.security_headers import API_CSP, DOCS_CSP


class TestSecurityHeaders:
    def test_api_endpoint_emits_strict_csp(self, unauthed_client: TestClient) -> None:
        resp = unauthed_client.get("/health")
        assert resp.status_code == 200
        assert resp.headers["content-security-policy"] == API_CSP

    def test_docs_endpoint_uses_docs_friendly_csp(self, unauthed_client: TestClient) -> None:
        resp = unauthed_client.get("/docs")
        assert resp.headers["content-security-policy"] == DOCS_CSP

    def test_openapi_json_uses_docs_friendly_csp(self, unauthed_client: TestClient) -> None:
        # ``/openapi.json`` is treated as a docs surface so any future
        # browser feature that fetches it (Swagger UI, Redoc, custom
        # explorers) keeps working with the docs-permissive CSP.
        resp = unauthed_client.get("/openapi.json")
        assert resp.headers["content-security-policy"] == DOCS_CSP

    def test_universal_security_headers_on_every_response(
        self, unauthed_client: TestClient
    ) -> None:
        resp = unauthed_client.get("/health")
        assert resp.headers["strict-transport-security"].startswith("max-age=")
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        permissions = resp.headers["permissions-policy"]
        assert "camera=()" in permissions
        assert "microphone=()" in permissions
        assert "geolocation=()" in permissions
