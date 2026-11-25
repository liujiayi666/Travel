import asyncio
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.agent.contracts import ToolCall, ToolResult
from app.agent.errors import AgentMaxStepsReachedError, AgentTokenBudgetExceededError
from app.agent.models import AgentRun, AgentToolCall
from app.agent.tools.registry import ToolRegistry
from app.agent.tools.travel.weather import WEATHER_DEFINITION
from app.agent.trace import AgentRunTrace
from app.agent.trace_service import cancel_agent_run
from app.auth.models import User
from app.conversations.models import Conversation, Message
from app.conversations.service import send_message
from app.core.config import settings
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmRequest,
    LlmResponse,
    LlmTextDelta,
    LlmUsage,
)
from app.llm.errors import LlmProviderError

TEST_USAGE = LlmUsage(input_tokens=10, output_tokens=5)


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
        autoflush=False,
    )

    try:
        yield factory
    finally:
        async with factory() as session:
            await session.execute(
                delete(User).where(User.email.like("agent-run-lifecycle-test-%@example.com"))
            )
            await session.commit()
        await engine.dispose()


def make_user() -> User:
    return User(
        email=f"agent-run-lifecycle-test-{uuid.uuid4().hex}@example.com",
        password_hash="unused-test-hash",
        display_name="Agent Run Lifecycle Test",
    )


async def persist_owner_and_conversation(
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[uuid.UUID, uuid.UUID]:
    async with session_factory() as session:
        user = make_user()
        session.add(user)
        await session.flush()
        conversation = Conversation(user_id=user.id, title="Lifecycle")
        session.add(conversation)
        await session.commit()
        return user.id, conversation.id


def make_tool_call(sequence: int) -> ToolCall:
    return ToolCall(
        id=f"call_weather_{sequence}",
        name="get_weather",
        arguments={
            "destination": "Hangzhou",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
        },
    )


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


class OneToolThenAnswerProvider:
    model = "test-model"

    def __init__(self) -> None:
        self.requests: list[LlmRequest] = []

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        if len(self.requests) == 1:
            return LlmResponse(tool_call=make_tool_call(1), usage=TEST_USAGE)
        return LlmResponse(
            message=LlmAssistantMessage(content="杭州当天最高约 19°C。"),
            usage=TEST_USAGE,
        )

    async def stream(
        self,
        request: LlmRequest,
    ) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Lifecycle test must use complete()")
        yield LlmTextDelta(text="unreachable")


class ToolThenFailProvider:
    model = "test-model"

    def __init__(self) -> None:
        self.requests: list[LlmRequest] = []

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        if len(self.requests) == 1:
            return LlmResponse(tool_call=make_tool_call(1), usage=TEST_USAGE)
        raise LlmProviderError("provider failed after tool execution")

    async def stream(
        self,
        request: LlmRequest,
    ) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Lifecycle test must use complete()")
        yield LlmTextDelta(text="unreachable")


class AlwaysToolProvider:
    model = "test-model"

    def __init__(self, usages: list[LlmUsage] | None = None) -> None:
        self.requests: list[LlmRequest] = []
        self.usages = usages or [TEST_USAGE]

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        index = min(len(self.requests) - 1, len(self.usages) - 1)
        return LlmResponse(
            tool_call=make_tool_call(len(self.requests)),
            usage=self.usages[index],
        )

    async def stream(
        self,
        request: LlmRequest,
    ) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Lifecycle test must use complete()")
        yield LlmTextDelta(text="unreachable")


class BlockingProvider:
    model = "test-model"

    def __init__(self) -> None:
        self.started = asyncio.Event()

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.started.set()
        await asyncio.Event().wait()
        raise AssertionError("cancelled provider must not return")

    async def stream(
        self,
        request: LlmRequest,
    ) -> AsyncGenerator[LlmTextDelta, None]:
        raise AssertionError("Lifecycle test must use complete()")
        yield LlmTextDelta(text="unreachable")


async def load_run(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    conversation_id: uuid.UUID,
) -> AgentRun:
    async with session_factory() as session:
        run = await session.scalar(
            select(AgentRun).where(AgentRun.conversation_id == conversation_id)
        )
        assert run is not None
        return run


async def load_tool_calls(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    agent_run_id: uuid.UUID,
) -> list[AgentToolCall]:
    async with session_factory() as session:
        return list(
            (
                await session.scalars(
                    select(AgentToolCall)
                    .where(AgentToolCall.agent_run_id == agent_run_id)
                    .order_by(AgentToolCall.sequence)
                )
            ).all()
        )


async def load_messages(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    conversation_id: uuid.UUID,
) -> list[Message]:
    async with session_factory() as session:
        return list(
            (
                await session.scalars(
                    select(Message)
                    .where(Message.conversation_id == conversation_id)
                    .order_by(Message.created_at, Message.id)
                )
            ).all()
        )


async def assert_lease_released(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    conversation_id: uuid.UUID,
) -> None:
    async with session_factory() as session:
        conversation = await session.get(Conversation, conversation_id)
        assert conversation is not None
        assert conversation.processing_token is None
        assert conversation.processing_expires_at is None


@pytest.mark.anyio
async def test_send_message_completes_run_and_persists_exchange_atomically(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    provider = OneToolThenAnswerProvider()
    weather_tool = RecordingWeatherTool()

    async with session_factory() as session:
        reply = await send_message(
            session,
            provider,
            user_id=user_id,
            conversation_id=conversation_id,
            content="杭州 11 月 20 日天气怎么样？",
            tool_registry=ToolRegistry([weather_tool]),
        )

    assert reply.content == "杭州当天最高约 19°C。"

    run = await load_run(session_factory, conversation_id=conversation_id)
    tool_calls = await load_tool_calls(session_factory, agent_run_id=run.id)
    messages = await load_messages(session_factory, conversation_id=conversation_id)

    assert run.status == "completed"
    assert run.failure_code is None
    assert run.step_count == 2
    assert run.input_tokens == 20
    assert run.output_tokens == 10
    assert run.duration_ms is not None
    assert run.finished_at is not None
    assert run.user_message_id == messages[0].id
    assert run.assistant_message_id == messages[1].id
    assert [(message.role, message.content) for message in messages] == [
        ("user", "杭州 11 月 20 日天气怎么样？"),
        ("assistant", "杭州当天最高约 19°C。"),
    ]
    assert [
        (tool_call.sequence, tool_call.call_id, tool_call.status) for tool_call in tool_calls
    ] == [(1, "call_weather_1", "success")]
    await assert_lease_released(session_factory, conversation_id=conversation_id)


@pytest.mark.anyio
async def test_send_message_failure_persists_run_and_no_messages(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    weather_tool = RecordingWeatherTool()

    async with session_factory() as session:
        with pytest.raises(LlmProviderError):
            await send_message(
                session,
                ToolThenFailProvider(),
                user_id=user_id,
                conversation_id=conversation_id,
                content="杭州天气",
                tool_registry=ToolRegistry([weather_tool]),
            )

    run = await load_run(session_factory, conversation_id=conversation_id)
    tool_calls = await load_tool_calls(session_factory, agent_run_id=run.id)
    messages = await load_messages(session_factory, conversation_id=conversation_id)

    assert run.status == "failed"
    assert run.failure_code == "llm_provider_error"
    assert run.user_message_id is None
    assert run.assistant_message_id is None
    assert len(tool_calls) == 1
    assert tool_calls[0].status == "success"
    assert messages == []
    await assert_lease_released(session_factory, conversation_id=conversation_id)


@pytest.mark.anyio
async def test_send_message_records_max_steps_without_executing_last_tool(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    weather_tool = RecordingWeatherTool()
    monkeypatch.setattr(settings, "agent_max_steps", 2)

    async with session_factory() as session:
        with pytest.raises(AgentMaxStepsReachedError):
            await send_message(
                session,
                AlwaysToolProvider(),
                user_id=user_id,
                conversation_id=conversation_id,
                content="循环查询天气",
                tool_registry=ToolRegistry([weather_tool]),
            )

    run = await load_run(session_factory, conversation_id=conversation_id)
    tool_calls = await load_tool_calls(session_factory, agent_run_id=run.id)
    messages = await load_messages(session_factory, conversation_id=conversation_id)

    assert run.status == "max_steps_reached"
    assert run.failure_code == "agent_max_steps_reached"
    assert run.step_count == 2
    assert len(weather_tool.calls) == 1
    assert len(tool_calls) == 1
    assert messages == []
    await assert_lease_released(session_factory, conversation_id=conversation_id)


@pytest.mark.anyio
async def test_send_message_records_token_budget_failure(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    weather_tool = RecordingWeatherTool()
    monkeypatch.setattr(settings, "agent_max_total_tokens", 100)
    provider = AlwaysToolProvider(
        usages=[
            LlmUsage(input_tokens=60, output_tokens=10),
            LlmUsage(input_tokens=30, output_tokens=20),
        ]
    )

    async with session_factory() as session:
        with pytest.raises(AgentTokenBudgetExceededError):
            await send_message(
                session,
                provider,
                user_id=user_id,
                conversation_id=conversation_id,
                content="预算测试",
                tool_registry=ToolRegistry([weather_tool]),
            )

    run = await load_run(session_factory, conversation_id=conversation_id)
    tool_calls = await load_tool_calls(session_factory, agent_run_id=run.id)
    messages = await load_messages(session_factory, conversation_id=conversation_id)

    assert run.status == "failed"
    assert run.failure_code == "agent_token_budget_exceeded"
    assert run.input_tokens == 90
    assert run.output_tokens == 30
    assert len(weather_tool.calls) == 1
    assert len(tool_calls) == 1
    assert messages == []
    await assert_lease_released(session_factory, conversation_id=conversation_id)


@pytest.mark.anyio
async def test_send_message_cancellation_records_terminal_run(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    provider = BlockingProvider()

    async with session_factory() as session:
        task = asyncio.create_task(
            send_message(
                session,
                provider,
                user_id=user_id,
                conversation_id=conversation_id,
                content="取消测试",
            )
        )
        await provider.started.wait()
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task

    run = await load_run(session_factory, conversation_id=conversation_id)
    tool_calls = await load_tool_calls(session_factory, agent_run_id=run.id)
    messages = await load_messages(session_factory, conversation_id=conversation_id)

    assert run.status == "cancelled"
    assert run.failure_code is None
    assert run.step_count == 0
    assert tool_calls == []
    assert messages == []
    await assert_lease_released(session_factory, conversation_id=conversation_id)


@pytest.mark.anyio
async def test_failed_run_helper_does_not_rollback_caller_transaction(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, _ = await persist_owner_and_conversation(session_factory)

    async with session_factory() as session:
        pending_conversation = Conversation(user_id=user_id, title="Pending")
        session.add(pending_conversation)
        await session.flush()
        pending_conversation_id = pending_conversation.id

        finalized = await cancel_agent_run(
            session,
            agent_run_id=uuid.uuid4(),
            trace=AgentRunTrace(),
            duration_ms=0,
            estimated_cost_usd=None,
        )

        assert finalized is False
        await session.commit()

    async with session_factory() as session:
        persisted = await session.get(Conversation, pending_conversation_id)

    assert persisted is not None
