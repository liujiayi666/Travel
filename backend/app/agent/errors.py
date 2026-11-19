class AgentRunError(Exception):
    """Agent 运行终止错误基类。"""

    code = "agent_run_error"


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
