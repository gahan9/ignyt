from app.core.config import Settings


class TestSettings:
    def test_default_project_id(self) -> None:
        s = Settings()
        assert s.gcp_project_id == "ignyt-dev"

    def test_default_gemini_key_empty(self) -> None:
        s = Settings()
        assert s.gemini_api_key == ""

    def test_default_cors_origins(self) -> None:
        s = Settings()
        assert s.cors_origins == ["http://localhost:5173"]

    def test_default_budget_limits(self) -> None:
        s = Settings()
        assert s.daily_gemini_requests == 100
        assert s.max_tokens_per_request == 1024
        assert s.daily_vision_calls == 50
        assert s.max_photo_uploads_per_user == 5

    def test_env_prefix(self) -> None:
        assert Settings.model_config["env_prefix"] == "EP_"

    def test_override_via_constructor(self) -> None:
        s = Settings(gcp_project_id="custom-project", daily_gemini_requests=10)
        assert s.gcp_project_id == "custom-project"
        assert s.daily_gemini_requests == 10
