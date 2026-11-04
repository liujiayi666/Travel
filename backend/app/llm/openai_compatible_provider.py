from openai import APIError, APITimeoutError, AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.llm.contracts import (
    LlmAssistantMessage,
    LlmMessage,
    LlmRequest,
    LlmResponse,
)
from app.llm.errors import LlmProviderError, LlmTimeoutError


class OpenAICompatibleProvider:
    def __init__(self, client: AsyncOpenAI, model: str, max_tokens: int) -> None:
        self._client = client
        self.model = model
        self.max_tokens = max_tokens

    async def complete(self, request: LlmRequest) -> LlmResponse:
        if not request.messages:
            raise LlmProviderError("Language model request has no messages")
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
            raise ValueError(f"Unsupported message role: {message.role}")
