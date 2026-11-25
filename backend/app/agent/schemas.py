import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ToolCallTraceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sequence: int
    tool_name: str
    status: Literal["success", "error", "failed"]
    error_code: str | None
    started_at: datetime
    finished_at: datetime
    duration_ms: int


class AgentRunResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: uuid.UUID
    conversation_id: uuid.UUID
    status: Literal[
        "running",
        "completed",
        "failed",
        "cancelled",
        "max_steps_reached",
    ]
    provider_name: str
    model: str
    failure_code: str | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    steps: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: Decimal | None
    tool_calls: list[ToolCallTraceResponse]
