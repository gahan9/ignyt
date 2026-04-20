"""Application settings loaded from environment variables / .env file.

Source of truth for configuration. All env vars are prefixed ``EP_`` (e.g.
``EP_GCP_PROJECT_ID``) so they namespace cleanly alongside other services'
variables. In Cloud Run, sensitive values come from Secret Manager and are
mounted as env vars at deploy time.
"""

import json
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings — single import point."""

    gcp_project_id: str = "ignyt-dev"
    gemini_api_key: str = ""

    # Typed as Any to prevent pydantic-settings from eagerly trying (and
    # failing) to parse semicolon-separated strings as JSON. The
    # validator below handles the actual conversion to list[str].
    cors_origins: Any = ["http://localhost:5173"]

    daily_gemini_requests: int = 100
    max_tokens_per_request: int = 1024
    daily_vision_calls: int = 50
    max_photo_uploads_per_user: int = 5

    # Per-identity throttle. Default = 60 burst, 1 token/sec sustained =
    # 60 requests/min steady state. Tune per environment via env vars.
    # Setting ``rate_limit_enabled=False`` disables the middleware entirely
    # (used in pytest, where 60 reqs/min would flake the suite).
    rate_limit_enabled: bool = True
    rate_limit_capacity: int = 60
    rate_limit_refill_per_sec: float = 1.0

    model_config = SettingsConfigDict(env_file=".env", env_prefix="EP_")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _assemble_cors_origins(cls, raw: Any) -> list[str]:
        """Accept either a JSON list or a ``;``-separated string from env."""
        if isinstance(raw, list):
            return raw
        if isinstance(raw, str):
            if raw.startswith("["):
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    pass
            # Fallback for raw semicolon-separated strings from gcloud run deploy
            return [origin.strip() for origin in raw.split(";") if origin.strip()]
        return [str(raw)] if raw else []


settings = Settings()
