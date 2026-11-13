from collections.abc import AsyncGenerator

from openai import APIError, APITimeoutError, AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.llm.contracts import (
    LlmAssistantMessage,
    LlmMessage,
    LlmRequest,
    LlmResponse,
    LlmTextDelta,
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

        try:
            completion = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
            )
        except APITimeoutError as exc:
            raise LlmTimeoutError("Language model request timed out") from exc
        except APIError as exc:
            raise LlmProviderError("Language model request failed") from exc
        if not completion.choices:
            raise LlmProviderError("Language model returned no choices")
        content = completion.choices[0].message.content
        if content is None or not content.strip():
            raise LlmProviderError("Language model returned no text")
        return LlmResponse(
            message=LlmAssistantMessage(role="assistant", content=content),
        )

    async def stream(self, request: LlmRequest) -> AsyncGenerator[LlmTextDelta, None]:
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


def to_sdk_message(message: LlmMessage) -> ChatCompletionMessageParam:
    match message.role:
        case "system":
            return {
                "role": "system",
                "content": message.content,
            }
        case "assistant":
            return {
                "role": "assistant",
                "content": message.content,
            }
        case "user":
            return {
                "role": "user",
                "content": message.content,
            }
        case _:
            raise LlmInvalidRequestError(f"Unsupported message role: {message.role}")
