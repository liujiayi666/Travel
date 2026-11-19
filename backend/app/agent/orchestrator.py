import asyncio
from dataclasses import dataclass
from decimal import Decimal

from app.agent.errors import AgentMaxStepsReachedError, AgentTokenBudgetExceededError
from app.agent.tools.registry import ToolRegistry
from app.core.config import settings
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmContextMessage,
    LlmPricing,
    LlmProvider,
    LlmRequest,
    LlmToolCallMessage,
    LlmToolResultMessage,
    LlmUsage,
)
from app.llm.errors import LlmProviderError, LlmTimeoutError


@dataclass(frozen=True)
class AgentRunResult:
    message: LlmAssistantMessage
    steps: int
    usage: LlmUsage
    estimated_cost_usd: Decimal | None


async def run_agent(
    provider: LlmProvider,
    registry: ToolRegistry,
    request: LlmRequest,
    *,
    max_steps: int,
    max_total_tokens: int,
    pricing: LlmPricing | None = None,
) -> AgentRunResult:
    if max_steps < 1:
        raise ValueError("max_steps must be at least 1")
    if max_total_tokens < 1:
        raise ValueError("max_total_tokens must be at least 1")

    messages: list[LlmContextMessage] = list(request.messages)
    usage = LlmUsage(input_tokens=0, output_tokens=0)

    try:
        async with asyncio.timeout(settings.agent_run_timeout):
            for step in range(1, max_steps + 1):
                response = await provider.complete(
                    LlmRequest(messages=tuple(messages), tools=registry.definitions)
                )
                usage = LlmUsage(
                    input_tokens=usage.input_tokens + response.usage.input_tokens,
                    output_tokens=usage.output_tokens + response.usage.output_tokens,
                )

                # 先计算有没有超过预算再调用工具 否则预算已超时仍可能产生副作用
                if usage.total_tokens > max_total_tokens:
                    raise AgentTokenBudgetExceededError(
                        max_total_tokens=max_total_tokens,
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                        steps=step,
                    )

                if response.message is not None:
                    estimated_cost_usd = (
                        pricing.estimate_cost(usage) if pricing is not None else None
                    )
                    return AgentRunResult(
                        message=response.message,
                        steps=step,
                        usage=usage,
                        estimated_cost_usd=estimated_cost_usd,
                    )

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
