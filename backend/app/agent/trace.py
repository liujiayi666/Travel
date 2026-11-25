import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from app.llm.contracts import LlmUsage

ToolTraceStatus = Literal["success", "error", "failed"]


@dataclass(frozen=True)
class ToolExecutionTrace:
    tool_name: str
    call_id: str
    sequence: int
    status: ToolTraceStatus
    error_code: str | None
    started_at: datetime
    finished_at: datetime
    duration_ms: int


@dataclass
class AgentRunTrace:
    steps: int = 0
    usage: LlmUsage = field(
        default_factory=lambda: LlmUsage(
            input_tokens=0,
            output_tokens=0,
        )
    )
    tool_calls: list[ToolExecutionTrace] = field(default_factory=list)

    def record_model_response(
        self,
        *,
        step: int,
        usage: LlmUsage,
    ) -> None:
        self.steps = step
        self.usage = LlmUsage(
            input_tokens=self.usage.input_tokens + usage.input_tokens,
            output_tokens=self.usage.output_tokens + usage.output_tokens,
        )

    def record_tool(
        self,
        *,
        call_id: str,
        tool_name: str,
        status: ToolTraceStatus,
        error_code: str | None,
        started_at: datetime,
        started_monotonic: float,
    ) -> None:
        self.tool_calls.append(
            ToolExecutionTrace(
                sequence=len(self.tool_calls) + 1,
                call_id=call_id,
                tool_name=tool_name,
                status=status,
                error_code=error_code,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                duration_ms=max(
                    0,
                    round((time.perf_counter() - started_monotonic) * 1000),
                ),
            )
        )
