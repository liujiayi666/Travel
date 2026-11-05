import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.conversations.models import Conversation, Message
from app.core.config import settings
from app.core.db import get_db
from app.main import create_app


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
                delete(User).where(User.email.like("conversation-api-test-%@example.com"))
            )
            await session.commit()
        await engine.dispose()


@asynccontextmanager
async def make_client(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    user_id: uuid.UUID | None,
) -> AsyncIterator[AsyncClient]:
    app = create_app()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    if user_id is not None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=user_id)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def make_user(display_name: str) -> User:
    return User(
        email=f"conversation-api-test-{uuid.uuid4().hex}@example.com",
        password_hash="unused-test-hash",
        display_name=display_name,
    )


async def persist_user(
    session_factory: async_sessionmaker[AsyncSession],
    display_name: str,
) -> uuid.UUID:
    user = make_user(display_name)
    async with session_factory() as session:
        session.add(user)
        await session.commit()
    return user.id


@pytest.mark.anyio
@pytest.mark.parametrize(
    "path",
    [
        "/api/conversations",
        f"/api/conversations/{uuid.uuid4()}/messages",
    ],
)
async def test_conversation_api_requires_authentication(
    session_factory: async_sessionmaker[AsyncSession],
    path: str,
) -> None:
    async with make_client(session_factory, user_id=None) as client:
        response = await client.get(path)

    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


@pytest.mark.anyio
async def test_list_conversations_returns_only_current_user_sorted_by_update(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_id = await persist_user(session_factory, "Owner")
    other_id = await persist_user(session_factory, "Other")

    async with session_factory() as session:
        older = Conversation(
            user_id=owner_id,
            title="Older",
            updated_at=datetime(2026, 11, 5, 9, 0, tzinfo=UTC),
        )
        newer = Conversation(
            user_id=owner_id,
            title="Newer",
            updated_at=datetime(2026, 11, 5, 10, 0, tzinfo=UTC),
        )
        foreign = Conversation(
            user_id=other_id,
            title="Foreign",
            updated_at=datetime(2026, 11, 5, 11, 0, tzinfo=UTC),
        )
        session.add_all([older, newer, foreign])
        await session.commit()

    async with make_client(session_factory, user_id=owner_id) as client:
        response = await client.get("/api/conversations")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": str(newer.id),
            "title": "Newer",
            "created_at": newer.created_at.isoformat().replace("+00:00", "Z"),
            "updated_at": "2026-11-05T10:00:00Z",
        },
        {
            "id": str(older.id),
            "title": "Older",
            "created_at": older.created_at.isoformat().replace("+00:00", "Z"),
            "updated_at": "2026-11-05T09:00:00Z",
        },
    ]
    assert all("user_id" not in conversation for conversation in response.json())


@pytest.mark.anyio
async def test_list_conversations_returns_empty_list(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "No conversations")

    async with make_client(session_factory, user_id=user_id) as client:
        response = await client.get("/api/conversations")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.anyio
async def test_messages_return_empty_list_for_owned_empty_conversation(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Empty conversation")

    async with session_factory() as session:
        conversation = Conversation(user_id=user_id, title="Empty")
        session.add(conversation)
        await session.commit()

    async with make_client(session_factory, user_id=user_id) as client:
        response = await client.get(f"/api/conversations/{conversation.id}/messages")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.anyio
async def test_messages_return_latest_page_in_chronological_order(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Message owner")

    async with session_factory() as session:
        conversation = Conversation(user_id=user_id, title="Ordering")
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

    async with make_client(session_factory, user_id=user_id) as client:
        response = await client.get(
            f"/api/conversations/{conversation.id}/messages",
            params={"limit": 2},
        )

    assert response.status_code == 200
    assert [message["content"] for message in response.json()] == ["Second", "Third"]
    assert set(response.json()[0]) == {
        "id",
        "conversation_id",
        "role",
        "content",
        "created_at",
    }


@pytest.mark.anyio
async def test_messages_hide_foreign_and_unknown_conversations(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_id = await persist_user(session_factory, "Owner")
    attacker_id = await persist_user(session_factory, "Attacker")

    async with session_factory() as session:
        conversation = Conversation(user_id=owner_id, title="Private")
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

    async with make_client(session_factory, user_id=attacker_id) as client:
        foreign_response = await client.get(f"/api/conversations/{conversation.id}/messages")
        missing_response = await client.get(f"/api/conversations/{uuid.uuid4()}/messages")

    assert foreign_response.status_code == 404
    assert foreign_response.json() == {"detail": "Conversation not found"}
    assert missing_response.status_code == 404
    assert missing_response.json() == foreign_response.json()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "path",
    [
        "/api/conversations?limit=0",
        "/api/conversations?limit=51",
        f"/api/conversations/{uuid.uuid4()}/messages?limit=0",
        f"/api/conversations/{uuid.uuid4()}/messages?limit=51",
    ],
)
async def test_conversation_api_rejects_invalid_limit(
    session_factory: async_sessionmaker[AsyncSession],
    path: str,
) -> None:
    user_id = await persist_user(session_factory, "Validation")

    async with make_client(session_factory, user_id=user_id) as client:
        response = await client.get(path)

    assert response.status_code == 422
