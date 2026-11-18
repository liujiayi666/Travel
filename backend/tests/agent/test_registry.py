import pytest

from app.agent.contracts import ToolCall, ToolDefinition, ToolResult
from app.agent.tools.errors import ToolNotAllowedError
from app.agent.tools.registry import ToolRegistry


class FakeTool:
    def __init__(self, name: str) -> None:
        self.definition = ToolDefinition(
            name=name,
            description="Fake tool",
            parameters={"type": "object", "properties": {}},
        )
        self.calls: list[ToolCall] = []

    async def execute(self, call: ToolCall) -> ToolResult:
        self.calls.append(call)
        raise AssertionError("Registry tests do not execute tools")


def test_registry_exposes_only_registered_tool_definitions() -> None:
    weather = FakeTool("get_weather")
    places = FakeTool("search_places")

    registry = ToolRegistry([weather, places])

    assert registry.definitions == (
        weather.definition,
        places.definition,
    )
    assert registry.get("get_weather") is weather


def test_registry_rejects_unknown_tools() -> None:
    registry = ToolRegistry([FakeTool("get_weather")])

    with pytest.raises(ToolNotAllowedError) as exc_info:
        registry.get("delete_everything")

    assert exc_info.value.tool_name == "delete_everything"


def test_registry_rejects_duplicate_tool_names() -> None:
    with pytest.raises(ValueError, match="duplicate tool"):
        ToolRegistry([FakeTool("get_weather"), FakeTool("get_weather")])
