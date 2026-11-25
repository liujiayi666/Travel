import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.agent.models import AgentRun, AgentToolCall
from app.auth.models import User
from app.conversations.models import Conversation
from app.core.config import settings


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
                delete(User).where(User.email.like("agent-trace-test-%@example.com"))
            )
            await session.commit()
        await engine.dispose()


def make_user() -> User:
    return User(
        email=f"agent-trace-test-{uuid.uuid4().hex}@example.com",
        password_hash="unused-test-hash",
        display_name="Agent Trace Test",
    )


async def persist_owner_and_conversation(
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[uuid.UUID, uuid.UUID]:
    async with session_factory() as session:
        user = make_user()
        session.add(user)
        await session.flush()
        conversation = Conversation(user_id=user.id, title="Trace")
        session.add(conversation)
        await session.commit()
        return user.id, conversation.id


def make_run(user_id: uuid.UUID, conversation_id: uuid.UUID) -> AgentRun:
    return AgentRun(
        user_id=user_id,
        conversation_id=conversation_id,
        provider_name="deepseek",
        model="deepseek-flash",
    )


@pytest.mark.anyio
async def test_running_agent_run_allows_missing_finish_fields(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)

    async with session_factory() as session:
        agent_run = make_run(user_id, conversation_id)
        session.add(agent_run)
        await session.commit()

    assert agent_run.status == "running"
    assert agent_run.finished_at is None
    assert agent_run.duration_ms is None


@pytest.mark.anyio
async def test_terminal_agent_run_requires_finish_time_and_duration(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)

    async with session_factory() as session:
        session.add(
            AgentRun(
                user_id=user_id,
                conversation_id=conversation_id,
                provider_name="deepseek",
                model="deepseek-flash",
                status="completed",
                finished_at=None,
                duration_ms=None,
            )
        )
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()


@pytest.mark.anyio
async def test_agent_tool_call_enforces_status_error_code_and_sequence(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        agent_run = make_run(user_id, conversation_id)
        session.add(agent_run)
        await session.flush()

        session.add(
            AgentToolCall(
                agent_run_id=agent_run.id,
                sequence=1,
                call_id="call_1",
                tool_name="get_weather",
                status="success",
                error_code="unexpected",
                started_at=now,
                finished_at=now,
                duration_ms=0,
            )
        )
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()

    async with session_factory() as session:
        agent_run = make_run(user_id, conversation_id)
        session.add(agent_run)
        await session.flush()
        session.add_all(
            [
                AgentToolCall(
                    agent_run_id=agent_run.id,
                    sequence=1,
                    call_id="call_1",
                    tool_name="get_weather",
                    status="success",
                    started_at=now,
                    finished_at=now,
                    duration_ms=0,
                ),
                AgentToolCall(
                    agent_run_id=agent_run.id,
                    sequence=1,
                    call_id="call_2",
                    tool_name="get_weather",
                    status="success",
                    started_at=now,
                    finished_at=now,
                    duration_ms=0,
                ),
            ]
        )
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()


@pytest.mark.anyio
async def test_deleting_user_cascades_agent_runs_and_tool_calls(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id, conversation_id = await persist_owner_and_conversation(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        agent_run = make_run(user_id, conversation_id)
        session.add(agent_run)
        await session.flush()
        session.add(
            AgentToolCall(
                agent_run_id=agent_run.id,
                sequence=1,
                call_id="call_1",
                tool_name="get_weather",
                status="success",
                started_at=now,
                finished_at=now,
                duration_ms=0,
            )
        )
        await session.commit()

    async with session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        await session.delete(user)
        await session.commit()

    async with session_factory() as session:
        run_count = await session.scalar(select(func.count()).select_from(AgentRun))
        tool_count = await session.scalar(select(func.count()).select_from(AgentToolCall))

    assert run_count == 0
    assert tool_count == 0
