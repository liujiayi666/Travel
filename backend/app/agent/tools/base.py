from typing import Protocol

from app.agent.contracts import ToolCall, ToolDefinition, ToolResult


class Tool(Protocol):
    definition: ToolDefinition

    async def execute(self, call: ToolCall) -> ToolResult: ...
