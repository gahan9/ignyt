from fastapi.testclient import TestClient

from app.main import app


class TestHealthEndpoint:
    def test_returns_200(self) -> None:
        with TestClient(app) as client:
            resp = client.get("/health")

        assert resp.status_code == 200

    def test_response_body(self) -> None:
        with TestClient(app) as client:
            resp = client.get("/health")

        body = resp.json()
        assert body["status"] == "healthy"
        assert body["service"] == "ignyt-api"

    def test_does_not_require_auth(self) -> None:
        saved_overrides = dict(app.dependency_overrides)
        try:
            app.dependency_overrides.clear()

            with TestClient(app) as client:
                resp = client.get("/health")

            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(saved_overrides)
