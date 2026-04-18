"""Application settings loaded from environment variables / .env file.

Source of truth for configuration. All env vars are prefixed ``EP_`` (e.g.
``EP_GCP_PROJECT_ID``) so they namespace cleanly alongside other services'
variables. In Cloud Run, sensitive values come from Secret Manager and are
mounted as env vars at deploy time.
"""

from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings — single import point."""

    gcp_project_id: str = "ignyt-dev"
    gemini_api_key: str = ""

    cors_origins: list[str] = ["http://localhost:5173"]

    daily_gemini_requests: int = 100
    max_tokens_per_request: int = 1024
    daily_vision_calls: int = 50
    max_photo_uploads_per_user: int = 5

    model_config = SettingsConfigDict(env_file=".env", env_prefix="EP_")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _assemble_cors_origins(cls, raw: Any) -> list[str] | Any:
        """Accept either a JSON list or a ``;``-separated string from env.

        Env vars are always strings; this lets operators write
        ``EP_CORS_ORIGINS="https://a.example;https://b.example"`` without
        quoting JSON. JSON-shaped strings (``"[...]"``) are passed through
        for Pydantic's native parser to handle.
        """
        if isinstance(raw, str) and not raw.startswith("["):
            return [origin.strip() for origin in raw.split(";") if origin.strip()]
        return raw


settings = Settings()
