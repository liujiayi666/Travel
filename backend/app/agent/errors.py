class AgentRunError(Exception):
    """Agent 运行终止错误基类。"""

    code = "agent_run_error"


class AgentMaxStepsReachedError(AgentRunError):
    code = "agent_max_steps_reached"

    def __init__(self, max_steps: int) -> None:
        self.max_steps = max_steps
        super().__init__(f"Agent reached the maximum of {max_steps} steps")
