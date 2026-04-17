from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str = "ignyt-dev"
    gemini_api_key: str = ""

    cors_origins: list[str] = ["http://localhost:5173"]

    daily_gemini_requests: int = 100
    max_tokens_per_request: int = 1024
    daily_vision_calls: int = 50
    max_photo_uploads_per_user: int = 5

    model_config = {"env_file": ".env", "env_prefix": "EP_"}


settings = Settings()
