import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import pytest

from app.agent.contracts import ToolCall, ToolResult
from app.agent.errors import AgentMaxStepsReachedError
from app.agent.orchestrator import run_agent
from app.agent.tools.errors import ToolNotAllowedError
from app.agent.tools.registry import ToolRegistry
from app.agent.tools.travel.weather import WEATHER_DEFINITION
from app.core.config import settings
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmMessage,
    LlmRequest,
    LlmResponse,
    LlmTextDelta,
    LlmToolCallMessage,
    LlmToolResultMessage,
)
from app.llm.errors import LlmTimeoutError


class SequenceProvider:
    def __init__(self, responses: list[LlmResponse]) -> None:
        self.responses = iter(responses)
        self.requests: list[LlmRequest] = []

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        return next(self.responses)

    async def stream(self, request: LlmRequest) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Agent loop tests must not stream")
        yield LlmTextDelta(text="unreachable")


class RecordingWeatherTool:
    definition = WEATHER_DEFINITION

    def __init__(self) -> None:
        self.calls: list[ToolCall] = []

    async def execute(self, call: ToolCall) -> ToolResult:
        self.calls.append(call)
        return ToolResult(
            call_id=call.id,
            name=call.name,
            status="success",
            data={
                "location": {"name": "Hangzhou"},
                "temperature_max_c": 19.4,
            },
            source="fake-weather",
            observed_at=datetime.now(UTC),
        )


class SlowProvider:
    def __init__(self) -> None:
        self.requests: list[LlmRequest] = []

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        await asyncio.sleep(0.05)
        return LlmResponse(message=LlmAssistantMessage(content="too late"))

    async def stream(self, request: LlmRequest) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Agent loop tests must not stream")
        yield LlmTextDelta(text="unreachable")


class BlockingProvider:
    def __init__(self) -> None:
        self.requests: list[LlmRequest] = []
        self.started = asyncio.Event()

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        self.started.set()
        await asyncio.Event().wait()
        raise AssertionError("cancelled provider must not return")

    async def stream(self, request: LlmRequest) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Agent loop tests must not stream")
        yield LlmTextDelta(text="unreachable")


def make_request() -> LlmRequest:
    return LlmRequest(
        messages=[
            LlmMessage(role="user", content="杭州 11 月 20 日天气怎么样？"),
        ]
    )


def make_call(number: int) -> ToolCall:
    return ToolCall(
        id=f"call_weather_{number}",
        name="get_weather",
        arguments={
            "destination": "Hangzhou",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
        },
    )


@pytest.mark.anyio
async def test_agent_loop_direct_answer_uses_one_provider_call() -> None:
    provider = SequenceProvider(
        [LlmResponse(message=LlmAssistantMessage(content="西湖"))],
    )
    tool = RecordingWeatherTool()

    reply = await run_agent(
        provider,
        ToolRegistry([tool]),
        make_request(),
        max_steps=3,
    )

    assert reply.content == "西湖"
    assert len(provider.requests) == 1
    assert provider.requests[0].tools == (WEATHER_DEFINITION,)
    assert tool.calls == []


@pytest.mark.anyio
async def test_agent_loop_executes_two_tools_and_preserves_tool_history() -> None:
    first_call = make_call(1)
    second_call = make_call(2)
    provider = SequenceProvider(
        [
            LlmResponse(tool_call=first_call),
            LlmResponse(tool_call=second_call),
            LlmResponse(message=LlmAssistantMessage(content="杭州两天最高约 19°C。")),
        ]
    )
    tool = RecordingWeatherTool()

    reply = await run_agent(
        provider,
        ToolRegistry([tool]),
        make_request(),
        max_steps=3,
    )

    assert reply.content == "杭州两天最高约 19°C。"
    assert len(provider.requests) == 3
    assert [len(request.messages) for request in provider.requests] == [1, 3, 5]
    assert tool.calls == [first_call, second_call]

    for request in provider.requests:
        assert request.tools == (WEATHER_DEFINITION,)

    first_follow_up = provider.requests[1].messages
    assert isinstance(first_follow_up[-2], LlmToolCallMessage)
    assert isinstance(first_follow_up[-1], LlmToolResultMessage)
    assert first_follow_up[-2].tool_call == first_call
    assert first_follow_up[-1].tool_result.call_id == first_call.id

    second_follow_up = provider.requests[2].messages
    assert isinstance(second_follow_up[-2], LlmToolCallMessage)
    assert isinstance(second_follow_up[-1], LlmToolResultMessage)
    assert second_follow_up[-2].tool_call == second_call
    assert second_follow_up[-1].tool_result.call_id == second_call.id


@pytest.mark.anyio
async def test_agent_loop_does_not_execute_tool_on_last_permitted_step() -> None:
    first_call = make_call(1)
    last_call = make_call(2)
    provider = SequenceProvider(
        [
            LlmResponse(tool_call=first_call),
            LlmResponse(tool_call=last_call),
        ]
    )
    tool = RecordingWeatherTool()

    with pytest.raises(AgentMaxStepsReachedError) as exc_info:
        await run_agent(
            provider,
            ToolRegistry([tool]),
            make_request(),
            max_steps=2,
        )

    assert exc_info.value.max_steps == 2
    assert len(provider.requests) == 2
    assert tool.calls == [first_call]


@pytest.mark.anyio
async def test_agent_loop_rejects_unknown_tool_even_on_last_step() -> None:
    unknown_call = ToolCall(
        id="call_delete",
        name="delete_everything",
        arguments={},
    )
    provider = SequenceProvider([LlmResponse(tool_call=unknown_call)])

    with pytest.raises(ToolNotAllowedError):
        await run_agent(
            provider,
            ToolRegistry([]),
            make_request(),
            max_steps=1,
        )

    assert len(provider.requests) == 1


@pytest.mark.anyio
async def test_agent_loop_rejects_non_positive_step_limit_before_calling_provider() -> None:
    provider = SequenceProvider([])

    with pytest.raises(ValueError, match="max_steps must be at least 1"):
        await run_agent(
            provider,
            ToolRegistry([]),
            make_request(),
            max_steps=0,
        )

    assert provider.requests == []


@pytest.mark.anyio
async def test_agent_loop_maps_total_deadline_to_llm_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "agent_run_timeout", 0.001)
    provider = SlowProvider()

    with pytest.raises(LlmTimeoutError, match="Agent run timed out"):
        await run_agent(
            provider,
            ToolRegistry([]),
            make_request(),
            max_steps=3,
        )

    assert len(provider.requests) == 1


@pytest.mark.anyio
async def test_agent_loop_propagates_cancellation_without_executing_tool() -> None:
    provider = BlockingProvider()
    tool = RecordingWeatherTool()
    task = asyncio.create_task(
        run_agent(
            provider,
            ToolRegistry([tool]),
            make_request(),
            max_steps=3,
        )
    )

    await provider.started.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert len(provider.requests) == 1
    assert tool.calls == []
