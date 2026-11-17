from datetime import datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9_]*$",
    )
    description: str = Field(min_length=1, max_length=1000)
    parameters: dict[str, Any]

    @model_validator(mode="after")
    def require_object_schema(self) -> Self:
        if self.parameters.get("type") != "object":
            raise ValueError("tool parameters must be an object JSON Schema")
        return self


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=64)
    arguments: dict[str, Any]


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    call_id: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=64)
    status: Literal["success", "error"]
    data: dict[str, Any] | None = None
    error_code: str | None = None
    source: str | None = None
    observed_at: datetime | None = None

    @model_validator(mode="after")
    def validate_payload(self) -> Self:
        if self.status == "success":
            if self.data is None or self.source is None or self.observed_at is None:
                raise ValueError("successful tool result requires data, source and time")
        elif self.error_code is None:
            raise ValueError("failed tool result requires error_code")
        return self
