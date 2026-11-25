import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.models import AgentRun, AgentRunStatus, AgentToolCall
from app.agent.trace import AgentRunTrace, ToolExecutionTrace

_FAILED_TERMINAL_STATUSES: frozenset[AgentRunStatus] = frozenset(
    {
        "failed",
        "cancelled",
        "max_steps_reached",
    }
)


async def create_agent_run(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    provider_name: str,
    model: str,
) -> AgentRun:
    agent_run = AgentRun(
        user_id=user_id,
        conversation_id=conversation_id,
        provider_name=provider_name,
        model=model,
        status="running",
        step_count=0,
        input_tokens=0,
        output_tokens=0,
    )
    session.add(agent_run)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return agent_run


async def complete_agent_run(
    session: AsyncSession,
    *,
    agent_run_id: uuid.UUID,
    user_message_id: uuid.UUID,
    assistant_message_id: uuid.UUID,
    trace: AgentRunTrace,
    duration_ms: int,
    estimated_cost_usd: Decimal | None,
) -> None:
    """
    固定迁移到 completed, 不 commit。

    Message 和 AgentRun 必须在外层 `_persist_exchange()` 的同事务中提交。
    """
    result = await session.execute(
        update(AgentRun)
        .where(
            AgentRun.id == agent_run_id,
            AgentRun.status == "running",
        )
        .values(
            status="completed",
            user_message_id=user_message_id,
            assistant_message_id=assistant_message_id,
            failure_code=None,
            finished_at=datetime.now(UTC),
            duration_ms=max(0, duration_ms),
            step_count=trace.steps,
            input_tokens=trace.usage.input_tokens,
            output_tokens=trace.usage.output_tokens,
            estimated_cost_usd=estimated_cost_usd,
        )
        .returning(AgentRun.id)
        .execution_options(synchronize_session=False)
    )

    if result.scalar_one_or_none() is None:
        raise RuntimeError("Agent run is no longer running")

    session.add_all(
        _build_agent_tool_calls(
            agent_run_id=agent_run_id,
            traces=trace.tool_calls,
        )
    )


async def cancel_agent_run(
    session: AsyncSession,
    *,
    agent_run_id: uuid.UUID,
    trace: AgentRunTrace,
    duration_ms: int,
    estimated_cost_usd: Decimal | None,
) -> bool:
    return await _finalize_failed_agent_run(
        session,
        agent_run_id=agent_run_id,
        status="cancelled",
        failure_code=None,
        trace=trace,
        duration_ms=duration_ms,
        estimated_cost_usd=estimated_cost_usd,
    )


async def fail_agent_run(
    session: AsyncSession,
    *,
    agent_run_id: uuid.UUID,
    failure_code: str,
    trace: AgentRunTrace,
    duration_ms: int,
    estimated_cost_usd: Decimal | None,
) -> bool:
    if not failure_code:
        raise ValueError("Failed agent run requires a failure code")

    return await _finalize_failed_agent_run(
        session,
        agent_run_id=agent_run_id,
        status="failed",
        failure_code=failure_code,
        trace=trace,
        duration_ms=duration_ms,
        estimated_cost_usd=estimated_cost_usd,
    )


async def mark_max_steps_reached_agent_run(
    session: AsyncSession,
    *,
    agent_run_id: uuid.UUID,
    trace: AgentRunTrace,
    duration_ms: int,
    estimated_cost_usd: Decimal | None,
) -> bool:
    return await _finalize_failed_agent_run(
        session,
        agent_run_id=agent_run_id,
        status="max_steps_reached",
        failure_code="agent_max_steps_reached",
        trace=trace,
        duration_ms=duration_ms,
        estimated_cost_usd=estimated_cost_usd,
    )


async def _finalize_failed_agent_run(
    session: AsyncSession,
    *,
    agent_run_id: uuid.UUID,
    status: AgentRunStatus,
    failure_code: str | None,
    trace: AgentRunTrace,
    duration_ms: int,
    estimated_cost_usd: Decimal | None,
) -> bool:
    if status not in _FAILED_TERMINAL_STATUSES:
        raise ValueError(f"Invalid failed terminal status: {status}")

    result = await session.execute(
        update(AgentRun)
        .where(
            AgentRun.id == agent_run_id,
            AgentRun.status == "running",
        )
        .values(
            status=status,
            failure_code=failure_code,
            finished_at=datetime.now(UTC),
            duration_ms=max(0, duration_ms),
            step_count=trace.steps,
            input_tokens=trace.usage.input_tokens,
            output_tokens=trace.usage.output_tokens,
            estimated_cost_usd=estimated_cost_usd,
        )
        .returning(AgentRun.id)
        .execution_options(synchronize_session=False)
    )

    if result.scalar_one_or_none() is None:
        return False

    session.add_all(
        _build_agent_tool_calls(
            agent_run_id=agent_run_id,
            traces=trace.tool_calls,
        )
    )

    await session.flush()
    return True


def _build_agent_tool_calls(
    *,
    agent_run_id: uuid.UUID,
    traces: list[ToolExecutionTrace],
) -> list[AgentToolCall]:
    return [
        AgentToolCall(
            agent_run_id=agent_run_id,
            sequence=trace.sequence,
            call_id=trace.call_id,
            tool_name=trace.tool_name,
            status=trace.status,
            error_code=trace.error_code,
            started_at=trace.started_at,
            finished_at=trace.finished_at,
            duration_ms=trace.duration_ms,
        )
        for trace in traces
    ]
