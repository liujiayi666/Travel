from app.agent.models import AgentRun, AgentToolCall
from app.agent.schemas import AgentRunResponse, ToolCallTraceResponse


def to_agent_run_response(
    agent_run: AgentRun,
    tool_calls: list[AgentToolCall],
) -> AgentRunResponse:
    return AgentRunResponse(
        run_id=agent_run.id,
        conversation_id=agent_run.conversation_id,
        status=agent_run.status,
        provider_name=agent_run.provider_name,
        model=agent_run.model,
        failure_code=agent_run.failure_code,
        started_at=agent_run.started_at,
        finished_at=agent_run.finished_at,
        duration_ms=agent_run.duration_ms,
        steps=agent_run.step_count,
        input_tokens=agent_run.input_tokens,
        output_tokens=agent_run.output_tokens,
        estimated_cost_usd=agent_run.estimated_cost_usd,
        tool_calls=[
            ToolCallTraceResponse(
                sequence=tool_call.sequence,
                tool_name=tool_call.tool_name,
                status=tool_call.status,
                error_code=tool_call.error_code,
                started_at=tool_call.started_at,
                finished_at=tool_call.finished_at,
                duration_ms=tool_call.duration_ms,
            )
            for tool_call in tool_calls
        ],
    )
