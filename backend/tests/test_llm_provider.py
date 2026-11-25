from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from openai import APIError, APITimeoutError, AsyncOpenAI

from app.llm.contracts import (
    LlmAssistantMessage,
    LlmMessage,
    LlmRequest,
    LlmTextRole,
    LlmUsage,
)
from app.llm.errors import LlmInvalidRequestError, LlmProviderError, LlmTimeoutError
from app.llm.openai_compatible_provider import (
    OpenAICompatibleProvider,
    to_sdk_message,
)

MAX_TOKENS = 1000
TEST_USAGE = SimpleNamespace(prompt_tokens=12, completion_tokens=4)


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
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=TEST_USAGE,
    )


def make_streaming_chunk(content: str | None):
    delta = SimpleNamespace(content=content)
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta)])


class FakeAsyncStream:
    def __init__(
        self,
        contents: list[str | None],
        *,
        error: Exception | None = None,
        error_after: int | None = None,
    ) -> None:
        self.contents = contents
        self.error = error
        self.error_after = error_after
        self.index = 0
        self.closed = False

    def __aiter__(self) -> "FakeAsyncStream":
        return self

    async def __anext__(self):
        if self.index >= len(self.contents):
            if self.error is not None and self.error_after == self.index:
                error = self.error
                self.error = None
                raise error
            raise StopAsyncIteration

        content = self.contents[self.index]
        self.index += 1
        return make_streaming_chunk(content)

    async def close(self) -> None:
        self.closed = True


def make_provider(client: AsyncOpenAI) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(client, "test-model", MAX_TOKENS)


def make_message(
    text: str = "hello",
    *,
    role: LlmTextRole = "user",
) -> LlmMessage:
    return LlmMessage(role=role, content=text)


@pytest.mark.anyio
async def test_provider_returns_assistant_message_and_maps_messages_to_sdk() -> None:
    client, create = make_client(make_completion("杭州周末可以去西湖。"))
    provider = make_provider(client)

    request = LlmRequest(messages=[make_message("杭州周末去哪玩？")])

    response = await provider.complete(request)

    assert response.message == LlmAssistantMessage(
        role="assistant",
        content="杭州周末可以去西湖。",
    )
    assert response.usage == LlmUsage(input_tokens=12, output_tokens=4)
    create.assert_awaited_once()
    await_args = create.await_args
    assert await_args is not None
    call = await_args.kwargs
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
def test_provider_maps_supported_message_roles(role: LlmTextRole) -> None:
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


@pytest.mark.anyio
async def test_provider_streams_non_empty_text_and_closes_upstream() -> None:
    upstream = FakeAsyncStream(["先去", None, "西湖", "", "。"])
    client, create = make_client(upstream)
    provider = make_provider(client)
    request = LlmRequest(messages=[make_message("杭州玩两天")])

    deltas = [delta.text async for delta in provider.stream(request)]

    assert deltas == ["先去", "西湖", "。"]
    assert upstream.closed is True
    create.assert_awaited_once()
    await_args = create.await_args
    assert await_args is not None
    call = await_args.kwargs
    assert call["model"] == "test-model"
    assert call["max_tokens"] == MAX_TOKENS
    assert call["stream"] is True
    assert call["messages"] == [{"role": "user", "content": "杭州玩两天"}]


@pytest.mark.anyio
async def test_provider_maps_midstream_api_error_and_closes_upstream() -> None:
    sdk_error = APIError("upstream failed", request=cast(Any, None), body=None)
    upstream = FakeAsyncStream(["先去"], error=sdk_error, error_after=1)
    client, _ = make_client(upstream)
    provider = make_provider(client)
    received: list[str] = []

    with pytest.raises(LlmProviderError) as exc_info:
        async for delta in provider.stream(
            LlmRequest(messages=[make_message("杭州玩两天")]),
        ):
            received.append(delta.text)

    assert received == ["先去"]
    assert exc_info.value.__cause__ is sdk_error
    assert upstream.closed is True


@pytest.mark.anyio
async def test_provider_rejects_stream_without_usable_text() -> None:
    upstream = FakeAsyncStream([None, ""])
    client, _ = make_client(upstream)
    provider = make_provider(client)

    with pytest.raises(LlmProviderError, match="no text"):
        async for _ in provider.stream(
            LlmRequest(messages=[make_message("杭州玩两天")]),
        ):
            pass

    assert upstream.closed is True


@pytest.mark.anyio
async def test_provider_closes_upstream_when_consumer_stops() -> None:
    upstream = FakeAsyncStream(["先去", "西湖"])
    client, _ = make_client(upstream)
    provider = make_provider(client)
    stream = provider.stream(LlmRequest(messages=[make_message("杭州玩两天")]))

    first_delta = await anext(stream)
    await stream.aclose()

    assert first_delta.text == "先去"
    assert upstream.closed is True
