import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.auth.models import User
from app.conversations.models import Conversation, Message
from app.core.config import settings


def create_test_session_factory() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
        autoflush=False,
    )
    return engine, session_factory


def make_user() -> User:
    return User(
        email=f"conversation-test-{uuid.uuid4().hex}@example.com",
        password_hash="unused-test-hash",
        display_name="Conversation Test User",
    )


async def persist_user(
    session_factory: async_sessionmaker[AsyncSession],
) -> uuid.UUID:
    user = make_user()
    async with session_factory() as session:
        session.add(user)
        await session.commit()
    return user.id


async def persist_conversation(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    user_id: uuid.UUID,
) -> uuid.UUID:
    conversation = Conversation(user_id=user_id, title="Kyoto planning")
    async with session_factory() as session:
        session.add(conversation)
        await session.commit()
    return conversation.id


async def remove_user(
    session_factory: async_sessionmaker[AsyncSession],
    user_id: uuid.UUID | None,
) -> None:
    if user_id is None:
        return

    async with session_factory() as session:
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()


@pytest.mark.anyio
async def test_conversation_persists_user_and_assistant_messages() -> None:
    engine, session_factory = create_test_session_factory()
    user_id: uuid.UUID | None = None

    try:
        user_id = await persist_user(session_factory)
        conversation = Conversation(user_id=user_id, title="Kyoto planning")
        user_created_at = datetime(2026, 11, 4, 9, 0, tzinfo=UTC)
        async with session_factory() as session:
            session.add(conversation)
            await session.flush()
            session.add_all(
                [
                    Message(
                        conversation_id=conversation.id,
                        role="user",
                        content="Plan a quiet five-day trip.",
                        created_at=user_created_at,
                    ),
                    Message(
                        conversation_id=conversation.id,
                        role="assistant",
                        content="Start with Kyoto's eastern temples.",
                        created_at=user_created_at + timedelta(microseconds=1),
                    ),
                ]
            )
            await session.commit()

        async with session_factory() as session:
            messages = (
                await session.scalars(
                    select(Message)
                    .where(Message.conversation_id == conversation.id)
                    .order_by(Message.created_at, Message.id)
                )
            ).all()

        assert [message.role for message in messages] == ["user", "assistant"]
        assert all(message.content for message in messages)
        assert messages[0].created_at.tzinfo is not None
        assert messages[0].created_at <= datetime.now(UTC)
    finally:
        await remove_user(session_factory, user_id)
        await engine.dispose()


@pytest.mark.anyio
async def test_message_rejects_invalid_role() -> None:
    engine, session_factory = create_test_session_factory()
    user_id: uuid.UUID | None = None

    try:
        user_id = await persist_user(session_factory)
        conversation_id = await persist_conversation(session_factory, user_id=user_id)

        async with session_factory() as session:
            session.add(
                Message(
                    conversation_id=conversation_id,
                    role=cast(Any, "tool"),
                    content="Invalid role",
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()
    finally:
        await remove_user(session_factory, user_id)
        await engine.dispose()


@pytest.mark.anyio
async def test_conversation_rejects_blank_title() -> None:
    engine, session_factory = create_test_session_factory()
    user_id: uuid.UUID | None = None

    try:
        user_id = await persist_user(session_factory)

        async with session_factory() as session:
            session.add(Conversation(user_id=user_id, title="   "))
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()
    finally:
        await remove_user(session_factory, user_id)
        await engine.dispose()


@pytest.mark.anyio
async def test_message_rejects_blank_content() -> None:
    engine, session_factory = create_test_session_factory()
    user_id: uuid.UUID | None = None

    try:
        user_id = await persist_user(session_factory)
        conversation_id = await persist_conversation(session_factory, user_id=user_id)

        async with session_factory() as session:
            session.add(
                Message(
                    conversation_id=conversation_id,
                    role="user",
                    content="   ",
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()
    finally:
        await remove_user(session_factory, user_id)
        await engine.dispose()


@pytest.mark.anyio
async def test_deleting_user_cascades_conversation_and_messages() -> None:
    engine, session_factory = create_test_session_factory()
    user_id: uuid.UUID | None = None

    try:
        user_id = await persist_user(session_factory)
        conversation_id = await persist_conversation(session_factory, user_id=user_id)

        async with session_factory() as session:
            session.add(
                Message(
                    conversation_id=conversation_id,
                    role="user",
                    content="Delete with the conversation.",
                )
            )
            await session.commit()

        async with session_factory() as session:
            user = await session.get(User, user_id)
            assert user is not None
            await session.delete(user)
            await session.commit()

        async with session_factory() as session:
            conversation_count = await session.scalar(
                select(func.count())
                .select_from(Conversation)
                .where(Conversation.id == conversation_id)
            )
            message_count = await session.scalar(
                select(func.count())
                .select_from(Message)
                .where(Message.conversation_id == conversation_id)
            )

        assert conversation_count == 0
        assert message_count == 0
    finally:
        await remove_user(session_factory, user_id)
        await engine.dispose()
