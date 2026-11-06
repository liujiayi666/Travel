import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.chat.schemas import MAX_TEXT_CHARS_PER_MESSAGE


class ConversationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=MAX_TEXT_CHARS_PER_MESSAGE)

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
