from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_TEXT_CHARS_PER_MESSAGE = 4000


class ChatResponseMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=MAX_TEXT_CHARS_PER_MESSAGE)

    @field_validator("message", mode="before")
    @classmethod
    def normalize_message(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class ChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: ChatResponseMessage
