from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from openai import APIError, APITimeoutError, AsyncOpenAI

from app.llm.contracts import LlmAssistantMessage, LlmMessage, LlmRequest
from app.llm.errors import LlmInvalidRequestError, LlmProviderError, LlmTimeoutError
from app.llm.openai_compatible_provider import (
    OpenAICompatibleProvider,
    to_sdk_message,
)

MAX_TOKENS = 1000


def make_client(
    create_result: object = None,
    *,
    create_error: Exception | None = None,
) -> tuple[AsyncOpenAI, AsyncMock]:
    create = AsyncMock(return_value=create_result, side_effect=create_error)
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create)),
    )
    return cast(AsyncOpenAI, client), create


def make_completion(content: str | None):
    message = SimpleNamespace(content=content)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def make_provider(client: AsyncOpenAI) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(client, "test-model", MAX_TOKENS)


def make_message(
    text: str = "hello",
    *,
    role: str = "user",
) -> LlmMessage:
    return LlmMessage(role=role, content=text)


@pytest.mark.anyio
async def test_provider_returns_assistant_message_and_maps_messages_to_sdk() -> None:
    client, create = make_client(make_completion("杭州周末可以去西湖。"))
    provider = make_provider(client)

    response = await provider.complete(LlmRequest(messages=[make_message("杭州周末去哪玩？")]))

    assert response.message == LlmAssistantMessage(
        role="assistant",
        content="杭州周末可以去西湖。",
    )
    create.assert_awaited_once()
    call = create.await_args.kwargs
    assert call["model"] == "test-model"
    assert call["max_tokens"] == MAX_TOKENS
    assert call["messages"] == [
        {
            "role": "user",
            "content": "杭州周末去哪玩？",
        }
    ]


@pytest.mark.anyio
async def test_provider_rejects_empty_messages() -> None:
    client, create = make_client(make_completion("unused"))
    provider = make_provider(client)

    with pytest.raises(LlmInvalidRequestError, match="no messages"):
        await provider.complete(LlmRequest(messages=[]))

    create.assert_not_awaited()


@pytest.mark.anyio
async def test_provider_rejects_empty_choices() -> None:
    client, _ = make_client(SimpleNamespace(choices=[]))
    provider = make_provider(client)

    with pytest.raises(LlmProviderError, match="no choices"):
        await provider.complete(LlmRequest(messages=[make_message()]))


@pytest.mark.anyio
@pytest.mark.parametrize("content", [None, "", "   "])
async def test_provider_rejects_missing_or_blank_text(content: str | None) -> None:
    client, _ = make_client(make_completion(content))
    provider = make_provider(client)

    with pytest.raises(LlmProviderError, match="no text"):
        await provider.complete(LlmRequest(messages=[make_message()]))


@pytest.mark.parametrize("role", ["system", "assistant", "user"])
def test_provider_maps_supported_message_roles(role: str) -> None:
    message = make_message(role=role)

    assert to_sdk_message(message) == {
        "role": role,
        "content": "hello",
    }


def test_provider_rejects_invalid_message_roles() -> None:
    message = LlmMessage.model_construct(role="tool", content="hello")

    with pytest.raises(LlmInvalidRequestError, match="Unsupported message role"):
        to_sdk_message(message)


@pytest.mark.anyio
async def test_provider_maps_sdk_timeout() -> None:
    sdk_error = APITimeoutError(request=cast(Any, None))
    client, _ = make_client(create_error=sdk_error)
    provider = make_provider(client)

    with pytest.raises(LlmTimeoutError) as exc_info:
        await provider.complete(LlmRequest(messages=[make_message()]))

    assert exc_info.value.__cause__ is sdk_error


@pytest.mark.anyio
async def test_provider_maps_sdk_api_error() -> None:
    sdk_error = APIError("upstream failed", request=cast(Any, None), body=None)
    client, _ = make_client(create_error=sdk_error)
    provider = make_provider(client)

    with pytest.raises(LlmProviderError) as exc_info:
        await provider.complete(LlmRequest(messages=[make_message()]))

    assert exc_info.value.__cause__ is sdk_error
