from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    # LLM
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    llm_model: str = "gpt-4o"

    # Database
    database_url: str = "postgresql+asyncpg://autostock:autostock@localhost:5432/autostock"
    database_url_sync: str = "postgresql://autostock:autostock@localhost:5432/autostock"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # KIS API
    kis_app_key: str = ""
    kis_app_secret: str = ""
    kis_account_no: str = ""
    kis_base_url: str = "https://openapi.koreainvestment.com:9443"

    # Naver API
    naver_client_id: str = ""
    naver_client_secret: str = ""

    # Notification
    discord_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # JWT
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    # Server
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_url: str = "http://localhost:3000"

    # N8N
    n8n_webhook_url: str = "http://n8n_live:5678/webhook/autostock-pipeline"
    n8n_backend_url: str = "http://autostock-backend:8000"

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent.parent

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
