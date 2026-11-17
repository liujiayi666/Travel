from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.agent.contracts import ToolCall, ToolDefinition, ToolResult


class LlmMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class LlmAssistantMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["assistant"] = "assistant"
    content: str = Field(min_length=1)


class LlmToolCallMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["assistant"] = "assistant"
    tool_call: ToolCall


class LlmToolResultMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["tool"] = "tool"
    tool_result: ToolResult


LlmContextMessage = LlmMessage | LlmToolCallMessage | LlmToolResultMessage


@dataclass(frozen=True)
class LlmRequest:
    messages: Sequence[LlmContextMessage]
    tools: tuple[ToolDefinition, ...] = ()


class LlmResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: LlmAssistantMessage | None = None
    tool_call: ToolCall | None = None

    @model_validator(mode="after")
    def require_exactly_one_outcome(self) -> Self:
        if (self.message is None) == (self.tool_call is None):
            raise ValueError("response must contain exactly one of message or tool_call")
        return self


@dataclass(frozen=True)
class LlmTextDelta:
    text: str


class LlmProvider(Protocol):
    async def complete(self, request: LlmRequest) -> LlmResponse: ...
    def stream(self, request: LlmRequest) -> AsyncGenerator[LlmTextDelta, None]: ...
