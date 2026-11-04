from dataclasses import dataclass

from fastapi import Request
from openai import AsyncOpenAI

from app.core.config import settings
from app.llm.contracts import LlmProvider
from app.llm.errors import LlmNotConfiguredError
from app.llm.openai_compatible_provider import OpenAICompatibleProvider


@dataclass
class LlmRuntime:
    provider: LlmProvider
    client: AsyncOpenAI


def create_llm_runtime() -> LlmRuntime | None:
    match settings.llm_provider:
        case "deepseek":
            if settings.deepseek_api_key is None:
                return
            client = AsyncOpenAI(
                api_key=settings.deepseek_api_key.get_secret_value(),
                base_url=settings.deepseek_base_url,
                timeout=settings.llm_timeout,
                max_retries=settings.llm_max_retries,
            )
            provider = OpenAICompatibleProvider(
                client, settings.deepseek_model, max_tokens=settings.deepseek_max_token
            )
            return LlmRuntime(provider=provider, client=client)
        case "glm":
            if settings.glm_api_key is None:
                return
            client = AsyncOpenAI(
                api_key=settings.glm_api_key.get_secret_value(),
                base_url=settings.glm_base_url,
                timeout=settings.llm_timeout,
                max_retries=settings.llm_max_retries,
            )
            provider = OpenAICompatibleProvider(
                client, settings.glm_model, max_tokens=settings.glm_max_token
            )
            return LlmRuntime(provider=provider, client=client)
        case _:
            return None


def get_llm_provider(request: Request) -> LlmProvider:
    provider = request.app.state.llm_provider
    if provider is None:
        raise LlmNotConfiguredError()
    return provider
