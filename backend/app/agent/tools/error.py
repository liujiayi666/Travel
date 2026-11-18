class ToolResultError(Exception):
    """Expected domain outcome that should become a status=error ToolResult."""

    code = "tool_result_error"


class WeatherLocationNotFoundError(ToolResultError):
    code = "weather_location_not_found"


class WeatherDataUnavailableError(ToolResultError):
    code = "weather_data_unavailable"


class ToolError(Exception):
    """Base class for tool-boundary failures."""

    code = "tool_error"


class ToolNotAllowedError(ToolError):
    code = "tool_not_allowed"

    def __init__(self, tool_name: str) -> None:
        self.tool_name = tool_name
        super().__init__(f"Tool is not allowed: {tool_name}")


class ToolInvalidArgumentsError(ToolError):
    code = "tool_invalid_arguments"


class ToolTimeoutError(ToolError):
    code = "tool_timeout"


class ToolExecutionError(ToolError):
    code = "tool_execution_error"
