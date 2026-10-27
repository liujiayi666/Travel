from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Travel Copilot"
    database_url: str = "postgresql+psycopg_async://travel:travel@localhost:5432/travel"
    session_ttl_days: int = 7
    auth_cookie_name: str = "session"
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    frontend_origin: str = "http://localhost:5173"

    @property
    def auth_cookie_secure(self) -> bool:
        return self.app_env == "production"


settings = Settings()
