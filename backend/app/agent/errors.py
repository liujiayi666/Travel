import uuid
from typing import Any, cast


class AgentRunError(Exception):
    """Agent 运行终止错误基类。"""

    code = "agent_run_error"


def attach_agent_run_id(exc: BaseException, run_id: uuid.UUID | None) -> None:
    if run_id is not None:
        cast(Any, exc).agent_run_id = run_id


def get_agent_run_id(exc: BaseException) -> uuid.UUID | None:
    run_id = getattr(exc, "agent_run_id", None)
    return run_id if isinstance(run_id, uuid.UUID) else None


def get_agent_run_error_metadata(
    exc: BaseException,
) -> tuple[dict[str, str], dict[str, str]]:
    run_id = get_agent_run_id(exc)
    if run_id is None:
        return {}, {}
    value = str(run_id)
    return {"runId": value}, {"X-Agent-Run-Id": value}


class AgentRunNotFoundError(Exception):
    pass


class AgentMaxStepsReachedError(AgentRunError):
    code = "agent_max_steps_reached"

    def __init__(self, max_steps: int) -> None:
        self.max_steps = max_steps
        super().__init__(f"Agent reached the maximum of {max_steps} steps")


class AgentTokenBudgetExceededError(AgentRunError):
    code = "agent_token_budget_exceeded"

    def __init__(
        self,
        max_total_tokens: int,
        input_tokens: int,
        output_tokens: int,
        steps: int,
    ) -> None:
        self.max_total_tokens = max_total_tokens
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.steps = steps
        super().__init__(
            f"Agent exceeded token budget after {steps} steps: "
            f"{input_tokens + output_tokens}/{max_total_tokens}"
        )
