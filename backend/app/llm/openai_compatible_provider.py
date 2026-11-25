import json
from collections.abc import AsyncGenerator
from typing import Any, cast

from openai import APIError, APITimeoutError, AsyncOpenAI
from openai.types import CompletionUsage
from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam
from pydantic import ValidationError

from app.agent.contracts import ToolCall, ToolDefinition
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmContextMessage,
    LlmMessage,
    LlmRequest,
    LlmResponse,
    LlmTextDelta,
    LlmToolCallMessage,
    LlmToolResultMessage,
    LlmUsage,
)
from app.llm.errors import LlmInvalidRequestError, LlmProviderError, LlmTimeoutError


class OpenAICompatibleProvider:
    def __init__(self, client: AsyncOpenAI, model: str, max_tokens: int) -> None:
        self._client = client
        self.model = model
        self.max_tokens = max_tokens

    async def complete(self, request: LlmRequest) -> LlmResponse:
        if not request.messages:
            raise LlmInvalidRequestError("Language model request has no messages")
        messages = [to_sdk_message(message) for message in request.messages]
        arguments: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
        }
        if request.tools:
            arguments["tools"] = [to_sdk_tool(tool) for tool in request.tools]
            arguments["tool_choice"] = "auto"

        try:
            completion = await self._client.chat.completions.create(**arguments)
        except APITimeoutError as exc:
            raise LlmTimeoutError("Language model request timed out") from exc
        except APIError as exc:
            raise LlmProviderError("Language model request failed") from exc
        if not completion.choices:
            raise LlmProviderError("Language model returned no choices")
        content = completion.choices[0].message.content
        upstream_message = completion.choices[0].message
        tool_calls = getattr(upstream_message, "tool_calls", None) or []
        usage = to_llm_usage(completion.usage)
        if len(tool_calls) > 1:
            # TODO: implement on A10
            raise LlmProviderError("Language model returned more than one tool call")
        if tool_calls:
            upstream_call = tool_calls[0]
            if upstream_call.type != "function":
                raise LlmProviderError("Unsupported tool call type")

            try:
                parsed_arguments = json.loads(upstream_call.function.arguments)
                if not isinstance(parsed_arguments, dict):
                    raise TypeError("Tool arguments must be a JSON object")

                tool_call = ToolCall(
                    id=upstream_call.id,
                    name=upstream_call.function.name,
                    arguments=parsed_arguments,
                )
            except (json.JSONDecodeError, TypeError, ValueError, ValidationError) as exc:
                raise LlmProviderError("Language model returned an invalid tool call") from exc

            return LlmResponse(tool_call=tool_call, usage=usage)
        if content is None or not content.strip():
            raise LlmProviderError("Language model returned no text")
        return LlmResponse(
            message=LlmAssistantMessage(role="assistant", content=content), usage=usage
        )

    async def stream(self, request: LlmRequest) -> AsyncGenerator[LlmTextDelta, None]:
        if request.tools:
            raise LlmInvalidRequestError("Tool calls are not supported in streaming mode")
        if not request.messages:
            raise LlmInvalidRequestError("Language model request has no messages")

        messages = [to_sdk_message(message) for message in request.messages]

        upstream_stream = None
        produced_text = False

        try:
            upstream_stream = await self._client.chat.completions.create(
                model=self.model, messages=messages, max_tokens=self.max_tokens, stream=True
            )

            async for chunk in upstream_stream:
                if not chunk.choices:
                    continue
                content = chunk.choices[0].delta.content
                if not content:
                    continue

                produced_text = True
                yield LlmTextDelta(text=content)
            if not produced_text:
                raise LlmProviderError("Language model returned no text")

        except APITimeoutError as exc:
            raise LlmTimeoutError("Language model request timed out") from exc
        except APIError as exc:
            raise LlmProviderError("Language model request failed") from exc
        finally:
            if upstream_stream is not None:
                await upstream_stream.close()


def to_sdk_message(message: LlmContextMessage) -> ChatCompletionMessageParam:
    if isinstance(message, LlmToolCallMessage):
        call = message.tool_call
        return cast(
            ChatCompletionMessageParam,
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": json.dumps(call.arguments, ensure_ascii=False),
                        },
                    }
                ],
            },
        )

    if isinstance(message, LlmToolResultMessage):
        result = message.tool_result

        return cast(
            ChatCompletionMessageParam,
            {
                "role": "tool",
                "tool_call_id": result.call_id,
                "content": json.dumps(
                    result.model_dump(mode="json", exclude_none=True),
                    ensure_ascii=False,
                ),
            },
        )

    assert isinstance(message, LlmMessage)
    if message.role not in ("system", "user", "assistant"):
        raise LlmInvalidRequestError(f"Unsupported message role: {message.role}")
    return cast(
        ChatCompletionMessageParam,
        {
            "role": message.role,
            "content": message.content,
        },
    )


def to_sdk_tool(tool: ToolDefinition) -> ChatCompletionToolParam:
    return cast(
        ChatCompletionToolParam,
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            },
        },
    )


def to_llm_usage(upstream_usage: CompletionUsage | None) -> LlmUsage:
    if upstream_usage is None:
        raise LlmProviderError("Language model returned no usage")

    try:
        return LlmUsage(
            input_tokens=upstream_usage.prompt_tokens,
            output_tokens=upstream_usage.completion_tokens,
        )
    except (AttributeError, TypeError, ValidationError):
        raise LlmProviderError("Language model returned invalid usage")
