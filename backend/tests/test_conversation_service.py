import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.models import User
from app.conversations.errors import ConversationNotFoundError
from app.conversations.models import Conversation, Message
from app.conversations.service import (
    DEFAULT_CONVERSATION_TITLE,
    MAX_TITLE_CHARS,
    SYSTEM_PROMPT,
    build_context,
    build_conversation_title,
    list_conversations,
    list_messages,
    send_message,
)
from app.core.config import Settings, settings
from app.llm.contracts import LlmAssistantMessage, LlmRequest, LlmResponse


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
                delete(User).where(User.email.like("conversation-service-test-%@example.com"))
            )
            await session.commit()
        await engine.dispose()


def make_user(display_name: str) -> User:
    return User(
        email=f"conversation-service-test-{uuid.uuid4().hex}@example.com",
        password_hash="unused-test-hash",
        display_name=display_name,
    )


def test_build_conversation_title_uses_first_message_content() -> None:
    content = f"  {'杭州周末行程' * 12}  "

    title = build_conversation_title(content)

    assert title == " ".join(content.split())[:MAX_TITLE_CHARS]
    assert len(title) == MAX_TITLE_CHARS
    assert build_conversation_title(" 杭州  周末 ") == "杭州 周末"
    assert build_conversation_title("   ") == DEFAULT_CONVERSATION_TITLE


def test_build_context_keeps_newest_messages_within_character_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid.uuid4()
    monkeypatch.setattr(
        settings,
        "chat_context_max_chars",
        len(SYSTEM_PROMPT) + len("current") + 4,
    )
    history = [
        Message(conversation_id=conversation_id, role="user", content="old1"),
        Message(conversation_id=conversation_id, role="assistant", content="new1"),
    ]

    context = build_context(history=history, content="current")

    assert [(message.role, message.content) for message in context] == [
        ("system", SYSTEM_PROMPT),
        ("assistant", "new1"),
        ("user", "current"),
    ]


def test_settings_reject_non_positive_context_limits() -> None:
    with pytest.raises(ValidationError):
        Settings(chat_context_max_messages=0)
    with pytest.raises(ValidationError):
        Settings(chat_context_max_chars=0)


@pytest.mark.anyio
async def test_send_message_releases_read_transaction_before_provider_call(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    transaction_states: list[bool] = []

    async with session_factory() as session:
        user = make_user("Provider transaction")
        session.add(user)
        await session.flush()
        conversation = Conversation(user_id=user.id, title="Context")
        session.add(conversation)
        await session.commit()

        class TransactionProbeProvider:
            async def complete(self, request: LlmRequest) -> LlmResponse:
                transaction_states.append(session.in_transaction())
                return LlmResponse(message=LlmAssistantMessage(content="reply"))

        await send_message(
            session,
            TransactionProbeProvider(),
            user_id=user.id,
            conversation_id=conversation.id,
            content="question",
        )

    assert transaction_states == [False]


@pytest.mark.anyio
async def test_list_conversations_returns_only_current_user_sorted_by_update(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = make_user("Current user")
        other_user = make_user("Other user")
        session.add_all([user, other_user])
        await session.flush()

        older = Conversation(
            user_id=user.id,
            title="Older",
            updated_at=datetime(2026, 11, 5, 9, 0, tzinfo=UTC),
        )
        newer = Conversation(
            user_id=user.id,
            title="Newer",
            updated_at=datetime(2026, 11, 5, 10, 0, tzinfo=UTC),
        )
        foreign = Conversation(
            user_id=other_user.id,
            title="Not visible",
            updated_at=datetime(2026, 11, 5, 11, 0, tzinfo=UTC),
        )
        session.add_all([older, newer, foreign])
        await session.commit()

        conversations = await list_conversations(session, user_id=user.id, limit=10)

        assert [conversation.id for conversation in conversations] == [newer.id, older.id]


@pytest.mark.anyio
async def test_list_conversations_returns_empty_list(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = make_user("No conversations")
        session.add(user)
        await session.commit()

        conversations = await list_conversations(session, user_id=user.id, limit=10)

        assert conversations == []


@pytest.mark.anyio
async def test_list_messages_rejects_conversation_owned_by_another_user(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        owner = make_user("Owner")
        attacker = make_user("Attacker")
        session.add_all([owner, attacker])
        await session.flush()

        conversation = Conversation(user_id=owner.id, title="Private")
        session.add(conversation)
        await session.flush()
        session.add(
            Message(
                conversation_id=conversation.id,
                role="user",
                content="Private message",
            )
        )
        await session.commit()

        with pytest.raises(ConversationNotFoundError):
            await list_messages(
                session,
                conversation_id=conversation.id,
                user_id=attacker.id,
                limit=10,
            )


@pytest.mark.anyio
async def test_list_messages_rejects_unknown_conversation(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = make_user("Unknown lookup")
        session.add(user)
        await session.commit()

        with pytest.raises(ConversationNotFoundError):
            await list_messages(
                session,
                conversation_id=uuid.uuid4(),
                user_id=user.id,
                limit=10,
            )


@pytest.mark.anyio
async def test_list_messages_returns_empty_list_for_empty_conversation(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = make_user("Empty conversation")
        session.add(user)
        await session.flush()
        conversation = Conversation(user_id=user.id, title="Empty")
        session.add(conversation)
        await session.commit()

        messages = await list_messages(
            session,
            conversation_id=conversation.id,
            user_id=user.id,
            limit=10,
        )

        assert messages == []


@pytest.mark.anyio
async def test_list_messages_limits_to_recent_and_returns_chronological_order(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        user = make_user("Ordered messages")
        session.add(user)
        await session.flush()
        conversation = Conversation(user_id=user.id, title="Ordering")
        session.add(conversation)
        await session.flush()

        start = datetime(2026, 11, 5, 9, 0, tzinfo=UTC)
        session.add_all(
            [
                Message(
                    conversation_id=conversation.id,
                    role="user",
                    content="First",
                    created_at=start,
                ),
                Message(
                    conversation_id=conversation.id,
                    role="assistant",
                    content="Second",
                    created_at=start + timedelta(seconds=1),
                ),
                Message(
                    conversation_id=conversation.id,
                    role="user",
                    content="Third",
                    created_at=start + timedelta(seconds=2),
                ),
            ]
        )
        await session.commit()

        messages = await list_messages(
            session,
            conversation_id=conversation.id,
            user_id=user.id,
            limit=2,
        )

        assert [message.content for message in messages] == ["Second", "Third"]
