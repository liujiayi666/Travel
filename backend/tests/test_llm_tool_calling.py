import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from openai import AsyncOpenAI

from app.agent.contracts import ToolCall, ToolDefinition, ToolResult
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmMessage,
    LlmRequest,
    LlmToolCallMessage,
    LlmToolResultMessage,
)
from app.llm.errors import LlmInvalidRequestError, LlmProviderError
from app.llm.openai_compatible_provider import (
    OpenAICompatibleProvider,
    to_sdk_message,
)


def make_client(completion: object) -> tuple[AsyncOpenAI, AsyncMock]:
    create = AsyncMock(return_value=completion)
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create)),
    )
    return cast(AsyncOpenAI, client), create


def make_provider(client: AsyncOpenAI) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(client, "test-model", max_tokens=1000)


def make_completion(message: object) -> object:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
    )


@pytest.mark.anyio
async def test_provider_sends_application_tools_in_chat_completions_shape() -> None:
    definition = ToolDefinition(
        name="get_weather",
        description="Get weather",
        parameters={
            "type": "object",
            "properties": {
                "destination": {"type": "string"},
            },
            "required": ["destination"],
        },
    )
    client, create = make_client(
        make_completion(SimpleNamespace(content="直接回答")),
    )
    provider = make_provider(client)

    response = await provider.complete(
        LlmRequest(
            messages=[LlmMessage(role="user", content="杭州天气")],
            tools=(definition,),
        )
    )

    assert response.message == LlmAssistantMessage(content="直接回答")
    call = create.await_args.kwargs
    assert call["tool_choice"] == "auto"
    assert call["tools"] == [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get weather",
                "parameters": definition.parameters,
            },
        }
    ]


@pytest.mark.anyio
async def test_provider_normalizes_openai_tool_call() -> None:
    arguments = json.dumps(
        {
            "destination": "Hangzhou",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
        }
    )
    message = SimpleNamespace(
        content=None,
        tool_calls=[
            SimpleNamespace(
                id="call_weather_1",
                type="function",
                function=SimpleNamespace(
                    name="get_weather",
                    arguments=arguments,
                ),
            )
        ],
    )
    client, _ = make_client(make_completion(message))
    provider = make_provider(client)

    response = await provider.complete(
        LlmRequest(
            messages=[LlmMessage(role="user", content="杭州天气")],
        )
    )

    assert response.tool_call == ToolCall(
        id="call_weather_1",
        name="get_weather",
        arguments={
            "destination": "Hangzhou",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
        },
    )


@pytest.mark.anyio
async def test_provider_rejects_parallel_tool_calls_in_single_tool_mode() -> None:
    call = SimpleNamespace(
        id="call_1",
        type="function",
        function=SimpleNamespace(
            name="get_weather",
            arguments='{"destination":"Hangzhou"}',
        ),
    )
    client, _ = make_client(
        make_completion(
            SimpleNamespace(
                content=None,
                tool_calls=[call, call],
            )
        )
    )
    provider = make_provider(client)

    with pytest.raises(LlmProviderError, match="more than one tool call"):
        await provider.complete(
            LlmRequest(
                messages=[LlmMessage(role="user", content="两个城市天气")],
            )
        )


@pytest.mark.anyio
async def test_provider_rejects_invalid_tool_arguments_json() -> None:
    client, _ = make_client(
        make_completion(
            SimpleNamespace(
                content=None,
                tool_calls=[
                    SimpleNamespace(
                        id="call_1",
                        type="function",
                        function=SimpleNamespace(
                            name="get_weather",
                            arguments="{not json",
                        ),
                    )
                ],
            )
        )
    )
    provider = make_provider(client)

    with pytest.raises(LlmProviderError, match="invalid tool call"):
        await provider.complete(
            LlmRequest(
                messages=[LlmMessage(role="user", content="杭州天气")],
            )
        )


def test_tool_call_and_result_map_to_openai_messages() -> None:
    call = ToolCall(
        id="call_1",
        name="get_weather",
        arguments={"destination": "Hangzhou"},
    )
    result = ToolResult(
        call_id="call_1",
        name="get_weather",
        status="success",
        data={"temperature_max_c": 19.4},
        source="open-meteo",
        observed_at=datetime.now(UTC),
    )

    assert to_sdk_message(LlmToolCallMessage(tool_call=call)) == {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": '{"destination": "Hangzhou"}',
                },
            }
        ],
    }

    tool_message = cast(
        dict[str, Any],
        to_sdk_message(LlmToolResultMessage(tool_result=result)),
    )
    assert tool_message["role"] == "tool"
    assert tool_message["tool_call_id"] == "call_1"
    payload = json.loads(cast(str, tool_message["content"]))
    assert payload["source"] == "open-meteo"
    assert payload["data"]["temperature_max_c"] == 19.4


@pytest.mark.anyio
async def test_streaming_rejects_tools_instead_of_silently_ignoring_them() -> None:
    client, create = make_client(make_completion(SimpleNamespace(content="unused")))
    provider = make_provider(client)
    request = LlmRequest(
        messages=[LlmMessage(role="user", content="杭州天气")],
        tools=(
            ToolDefinition(
                name="get_weather",
                description="Get weather",
                parameters={"type": "object", "properties": {}},
            ),
        ),
    )

    stream = provider.stream(request)

    with pytest.raises(LlmInvalidRequestError, match="not supported"):
        await anext(stream)

    create.assert_not_awaited()
