from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class LlmMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class LlmAssistantMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["assistant"] = "assistant"
    content: str = Field(min_length=1)


@dataclass(frozen=True)
class LlmRequest:
    messages: list[LlmMessage]


@dataclass(frozen=True)
class LlmResponse:
    message: LlmAssistantMessage


class LlmProvider(Protocol):
    async def complete(self, request: LlmRequest) -> LlmResponse: ...
