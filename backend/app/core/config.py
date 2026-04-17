from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str = "ignyt-dev"
    gemini_api_key: str = ""

    cors_origins: Any = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str] | Any:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(";")]
        return v

    daily_gemini_requests: int = 100
    max_tokens_per_request: int = 1024
    daily_vision_calls: int = 50
    max_photo_uploads_per_user: int = 5

    model_config = {"env_file": ".env", "env_prefix": "EP_"}


settings = Settings()
