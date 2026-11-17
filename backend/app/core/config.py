from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
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
    tool_timeout: float = Field(default=10.0, gt=0)
    agent_run_timeout: float = Field(default=60.0, gt=0)

    llm_provider: Literal["deepseek", "glm"] = "deepseek"
    llm_timeout: float = Field(default=30.0, gt=0)
    llm_max_retries: int = 0
    chat_context_max_messages: int = Field(default=40, gt=0)
    chat_context_max_chars: int = Field(default=16_000, gt=0)
    deepseek_api_key: SecretStr | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"
    deepseek_max_token: int = 1000

    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-6-astra"

    glm_api_key: SecretStr | None = None
    glm_model: str = "glm-5.3-flash"
    glm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    glm_max_token: int = 1000

    conversation_lease_seconds: int = Field(default=90, gt=0)

    @model_validator(mode="after")
    def validate_conversation_lease(self) -> Self:
        maximum_run_seconds = max(
            self.llm_timeout,
            self.agent_run_timeout,
        )
        if self.conversation_lease_seconds <= maximum_run_seconds:
            raise ValueError("conversation_lease_seconds must be greater than llm_timeout")
        return self

    @property
    def auth_cookie_secure(self) -> bool:
        return self.app_env == "production"


settings = Settings()
