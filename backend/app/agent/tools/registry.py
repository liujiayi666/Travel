from collections.abc import Iterable

from app.agent.contracts import ToolDefinition
from app.agent.tools.base import Tool
from app.agent.tools.error import ToolNotAllowedError


class ToolRegistry:
    def __init__(self, tools: Iterable[Tool]) -> None:
        self._tools: dict[str, Tool] = {}

        for tool in tools:
            name = tool.definition.name
            if name in self._tools:
                raise ValueError(f"duplicate tool: {name}")
            self._tools[name] = tool

    @property
    def definitions(self) -> tuple[ToolDefinition, ...]:
        return tuple(tool.definition for tool in self._tools.values())

    def get(self, name: str) -> Tool:
        tool = self._tools.get(name)
        if tool is None:
            raise ToolNotAllowedError(name)
        return tool
