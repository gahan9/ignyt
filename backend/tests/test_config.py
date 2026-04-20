from app.core.config import Settings


def _clean_settings(**overrides: object) -> Settings:
    """Build a Settings instance isolated from the developer's local ``.env``.

    Without this, tests that assert on default values break on any machine
    where the dev has populated ``backend/.env`` (e.g. with a real
    ``EP_GCP_PROJECT_ID`` or ``EP_RECAPTCHA_SECRET_KEY``). Passing
    ``_env_file=None`` is the pydantic-settings-sanctioned override that
    disables on-disk dotenv loading for a single instance.
    """
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]


class TestSettings:
    def test_default_project_id(self) -> None:
        s = _clean_settings()
        assert s.gcp_project_id == "ignyt-dev"

    def test_default_gemini_key_empty(self) -> None:
        s = _clean_settings()
        assert s.gemini_api_key == ""

    def test_default_cors_origins(self) -> None:
        s = _clean_settings()
        assert s.cors_origins == ["http://localhost:5173"]

    def test_default_budget_limits(self) -> None:
        s = _clean_settings()
        assert s.daily_gemini_requests == 100
        assert s.max_tokens_per_request == 1024
        assert s.daily_vision_calls == 50
        assert s.max_photo_uploads_per_user == 5

    def test_env_prefix(self) -> None:
        assert Settings.model_config["env_prefix"] == "EP_"

    def test_override_via_constructor(self) -> None:
        s = _clean_settings(gcp_project_id="custom-project", daily_gemini_requests=10)
        assert s.gcp_project_id == "custom-project"
        assert s.daily_gemini_requests == 10
