class ToolError(Exception):
    """Base class for tool-boundary failures."""


class ToolNotAllowedError(ToolError):
    def __init__(self, tool_name: str) -> None:
        self.tool_name = tool_name
        super().__init__(f"Tool is not allowed: {tool_name}")


class ToolInvalidArgumentsError(ToolError):
    pass


class ToolTimeoutError(ToolError):
    pass


class ToolExecutionError(ToolError):
    pass
