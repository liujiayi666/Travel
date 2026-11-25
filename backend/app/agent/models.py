import datetime
import uuid
from decimal import Decimal
from typing import Literal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

AgentRunStatus = Literal[
    "running",
    "completed",
    "failed",
    "cancelled",
    "max_steps_reached",
]


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("conversations.id", ondelete="CASCADE"),
    )

    user_message_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("messages.id", ondelete="SET NULL"),
    )

    assistant_message_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("messages.id", ondelete="SET NULL"),
    )

    status: Mapped[AgentRunStatus] = mapped_column(
        String(32),
        nullable=False,
        server_default="running",
    )

    provider_name: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    step_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))

    __table_args__ = (
        Index(
            "ix_agent_runs_conversation_id_started_at_id",
            "conversation_id",
            "started_at",
            "id",
        ),
        Index(
            "ix_agent_runs_user_id_started_at_id",
            "user_id",
            "started_at",
            "id",
        ),
        CheckConstraint(
            "status in ('running', 'completed', 'failed', 'cancelled', 'max_steps_reached')",
            name="status_valid",
        ),
        CheckConstraint(
            "step_count >= 0",
            name="step_count_non_negative",
        ),
        CheckConstraint(
            "input_tokens >= 0",
            name="input_tokens_non_negative",
        ),
        CheckConstraint(
            "output_tokens >= 0",
            name="output_tokens_non_negative",
        ),
        CheckConstraint(
            "duration_ms is null or duration_ms >= 0",
            name="duration_non_negative",
        ),
        CheckConstraint(
            "status = 'running' or (finished_at is not null and duration_ms is not null)",
            name="terminal_has_finish",
        ),
    )


class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("agent_runs.id", ondelete="CASCADE")
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    call_id: Mapped[str] = mapped_column(String(200), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[Literal["success", "error", "failed"]] = mapped_column(
        String(16),
        nullable=False,
    )
    error_code: Mapped[str | None] = mapped_column(String(64))
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    finished_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "agent_run_id",
            "sequence",
            name="uq_agent_tool_calls_run_sequence",
        ),
        Index(
            "ix_agent_tool_calls_agent_run_id_sequence",
            "agent_run_id",
            "sequence",
        ),
        CheckConstraint(
            "status in ('success', 'error', 'failed')",
            name="status_valid",
        ),
        CheckConstraint(
            "sequence > 0",
            name="sequence_positive",
        ),
        CheckConstraint(
            "duration_ms >= 0",
            name="duration_non_negative",
        ),
        CheckConstraint(
            "(status = 'success' and error_code is null) "
            "or (status in ('error', 'failed') and error_code is not null)",
            name="error_code_valid",
        ),
    )
