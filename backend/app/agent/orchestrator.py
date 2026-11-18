import asyncio

from app.agent.errors import AgentMaxStepsReachedError
from app.agent.tools.registry import ToolRegistry
from app.core.config import settings
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmContextMessage,
    LlmProvider,
    LlmRequest,
    LlmToolCallMessage,
    LlmToolResultMessage,
)
from app.llm.errors import LlmProviderError, LlmTimeoutError


async def run_agent(
    provider: LlmProvider,
    registry: ToolRegistry,
    request: LlmRequest,
    *,
    max_steps: int,
) -> LlmAssistantMessage:
    if max_steps < 1:
        raise ValueError("max_steps must be at least 1")
    messages: list[LlmContextMessage] = list(request.messages)

    try:
        async with asyncio.timeout(settings.agent_run_timeout):
            for step in range(1, max_steps + 1):
                response = await provider.complete(
                    LlmRequest(messages=tuple(messages), tools=registry.definitions)
                )

                if response.message is not None:
                    return response.message

                tool_call = response.tool_call
                if tool_call is None:
                    raise LlmProviderError("Language model returned no usable output")

                tool = registry.get(tool_call.name)  # 先确定工具是否合法

                if step == max_steps:  # 再判断步数
                    raise AgentMaxStepsReachedError(max_steps)

                tool_result = await tool.execute(tool_call)
                messages.append(LlmToolCallMessage(tool_call=tool_call))
                messages.append(LlmToolResultMessage(tool_result=tool_result))
        raise AssertionError("agent loop exited without a terminal state")
    except TimeoutError as exc:
        raise LlmTimeoutError("Agent run timed out") from exc
