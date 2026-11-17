import asyncio
from dataclasses import replace

from app.agent.tools.registry import ToolRegistry
from app.core.config import settings
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmProvider,
    LlmRequest,
    LlmToolCallMessage,
    LlmToolResultMessage,
)
from app.llm.errors import LlmProviderError, LlmTimeoutError


async def answer_with_one_tool(
    provider: LlmProvider,
    registry: ToolRegistry,
    request: LlmRequest,
) -> LlmAssistantMessage:
    try:
        async with asyncio.timeout(settings.agent_run_timeout):
            first_reponse = await provider.complete(replace(request, tools=registry.definitions))

            if first_reponse.tool_call is None:
                if first_reponse.message is None:
                    raise LlmProviderError("Language model returned no usable output")
                return first_reponse.message
            tool_call = first_reponse.tool_call
            tool = registry.get(tool_call.name)
            tool_result = await tool.execute(tool_call)

            second_response = await provider.complete(
                LlmRequest(
                    messages=[
                        *request.messages,
                        LlmToolCallMessage(tool_call=tool_call),
                        LlmToolResultMessage(tool_result=tool_result),
                    ],
                    tools=(),
                )
            )

            if second_response.tool_call is not None:
                # TODO: need loop tool
                raise LlmProviderError("Language model requested another tool in single-tool mode")
            if second_response.message is None:
                raise LlmProviderError("Language model returned no final answer")

            return second_response.message
    except TimeoutError as exc:
        raise LlmTimeoutError("Agent run timed out") from exc
