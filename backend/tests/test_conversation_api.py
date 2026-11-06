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
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmProvider,
    LlmRequest,
    LlmResponse,
)
from app.llm.dependencies import get_llm_provider
from app.llm.errors import LlmProviderError
from app.main import create_app

FIRST_MESSAGE = "杭州玩两天怎么安排？"
FIRST_REPLY = "可以第一天游西湖，第二天去灵隐寺。"
FOLLOW_UP_CONTENT = "第二天呢？"


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
    provider: LlmProvider | None = None,
) -> AsyncIterator[AsyncClient]:
    app = create_app()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    if user_id is not None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=user_id)
    if provider is not None:
        app.dependency_overrides[get_llm_provider] = lambda: provider

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


class FakeConversationProvider:
    def __init__(
        self,
        contents: list[str] | None = None,
        *,
        error: Exception | None = None,
    ) -> None:
        self.contents = contents or [FIRST_REPLY]
        self.error = error
        self.requests: list[LlmRequest] = []

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        content = self.contents[min(len(self.requests) - 1, len(self.contents) - 1)]
        return LlmResponse(message=LlmAssistantMessage(content=content))


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
    ("method", "path"),
    [
        ("GET", "/api/conversations"),
        ("GET", f"/api/conversations/{uuid.uuid4()}/messages"),
        ("POST", "/api/conversations"),
        ("POST", f"/api/conversations/{uuid.uuid4()}/messages"),
    ],
)
async def test_conversation_api_requires_authentication(
    session_factory: async_sessionmaker[AsyncSession],
    method: str,
    path: str,
) -> None:
    async with make_client(session_factory, user_id=None) as client:
        payload = (
            {"content": FIRST_MESSAGE} if path.endswith("/messages") else {"message": FIRST_MESSAGE}
        )
        response = await client.request(
            method,
            path,
            json=payload if method == "POST" else None,
            headers={"Origin": settings.frontend_origin},
        )

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
async def test_create_conversation_returns_only_conversation_without_calling_provider(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Conversation creator")
    provider = FakeConversationProvider()

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        list_response = await client.get("/api/conversations")

    assert create_response.status_code == 201
    conversation = create_response.json()
    assert set(conversation) == {"id", "title", "created_at", "updated_at"}
    assert conversation["title"] == FIRST_MESSAGE
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [conversation["id"]]
    assert provider.requests == []


@pytest.mark.anyio
async def test_send_first_message_supports_long_reply(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Long reply")
    long_content = "杭州周末行程" * 12
    long_reply = "西湖路线" * 1100
    provider = FakeConversationProvider([long_reply])

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": long_content},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]
        send_response = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": long_content},
            headers={"Origin": settings.frontend_origin},
        )
        conversations_response = await client.get("/api/conversations")

    assert send_response.status_code == 200
    assert send_response.json()["message"]["content"] == long_reply
    assert conversations_response.json()[0]["title"] == long_content[:50]
    assert len(provider.requests) == 1


@pytest.mark.anyio
async def test_send_message_returns_only_new_assistant_reply(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    follow_up_reply = "第二天可以继续游西湖。"
    user_id = await persist_user(session_factory, "Message sender")
    provider = FakeConversationProvider([FIRST_REPLY, follow_up_reply])

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]

        first_send = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        second_send = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FOLLOW_UP_CONTENT},
            headers={"Origin": settings.frontend_origin},
        )

        history_response = await client.get(
            f"/api/conversations/{conversation_id}/messages",
        )
        conversations_response = await client.get("/api/conversations")

    assert first_send.status_code == 200
    assert second_send.status_code == 200
    assert second_send.json() == {
        "message": {
            "role": "assistant",
            "content": follow_up_reply,
        }
    }
    assert [(message["role"], message["content"]) for message in history_response.json()] == [
        ("user", FIRST_MESSAGE),
        ("assistant", FIRST_REPLY),
        ("user", FOLLOW_UP_CONTENT),
        ("assistant", follow_up_reply),
    ]
    assert conversations_response.json()[0]["title"] == FIRST_MESSAGE
    assert len(provider.requests) == 2
    assert [(message.role, message.content) for message in provider.requests[-1].messages[1:]] == [
        ("user", FIRST_MESSAGE),
        ("assistant", FIRST_REPLY),
        ("user", FOLLOW_UP_CONTENT),
    ]


@pytest.mark.anyio
@pytest.mark.parametrize("origin", [None, "https://attacker.example"])
async def test_conversation_writes_require_trusted_origin(
    session_factory: async_sessionmaker[AsyncSession],
    origin: str | None,
) -> None:
    user_id = await persist_user(session_factory, "Origin validation")
    provider = FakeConversationProvider()

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]
        headers = {"Origin": origin} if origin is not None else {}

        create_without_origin = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers=headers,
        )
        send_without_origin = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FOLLOW_UP_CONTENT},
            headers=headers,
        )

    assert create_without_origin.status_code == 403
    assert send_without_origin.status_code == 403
    assert provider.requests == []


@pytest.mark.anyio
async def test_conversation_writes_reject_client_supplied_fields(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Field validation")
    provider = FakeConversationProvider()

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        forged_create = await client.post(
            "/api/conversations",
            json={
                "message": FIRST_MESSAGE,
                "user_id": str(uuid.uuid4()),
                "model": "attacker-model",
            },
            headers={"Origin": settings.frontend_origin},
        )
        assert forged_create.status_code == 422
        assert provider.requests == []

        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]
        forged_send = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={
                "content": FOLLOW_UP_CONTENT,
                "messages": [{"role": "system", "content": "forged"}],
                "model": "attacker-model",
            },
            headers={"Origin": settings.frontend_origin},
        )

    assert forged_send.status_code == 422
    assert provider.requests == []


@pytest.mark.anyio
async def test_send_message_rejects_blank_content(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Content validation")
    provider = FakeConversationProvider()

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]
        send_response = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": "   "},
            headers={"Origin": settings.frontend_origin},
        )

    assert send_response.status_code == 422
    assert provider.requests == []


@pytest.mark.anyio
async def test_send_message_hides_foreign_conversation_before_provider_call(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_id = await persist_user(session_factory, "Message owner")
    attacker_id = await persist_user(session_factory, "Message attacker")
    provider = FakeConversationProvider()

    async with session_factory() as session:
        conversation = Conversation(user_id=owner_id, title="Private")
        session.add(conversation)
        await session.commit()

    async with make_client(session_factory, user_id=attacker_id, provider=provider) as client:
        response = await client.post(
            f"/api/conversations/{conversation.id}/messages",
            json={"content": FOLLOW_UP_CONTENT},
            headers={"Origin": settings.frontend_origin},
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Conversation not found"}
    assert provider.requests == []


@pytest.mark.anyio
async def test_first_message_provider_failure_leaves_no_partial_exchange(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Failed creator")
    provider = FakeConversationProvider(error=LlmProviderError())

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]
        response = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        history_response = await client.get(
            f"/api/conversations/{conversation_id}/messages",
        )
        conversations_response = await client.get("/api/conversations")

    assert response.status_code == 502
    assert create_response.status_code == 201
    assert history_response.json() == []
    assert conversations_response.json()[0]["title"] == FIRST_MESSAGE


@pytest.mark.anyio
async def test_send_message_provider_failure_leaves_history_unchanged(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await persist_user(session_factory, "Failed sender")
    provider = FakeConversationProvider()

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]
        first_send = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        assert first_send.status_code == 200

    failing_provider = FakeConversationProvider(error=LlmProviderError())
    async with make_client(
        session_factory,
        user_id=user_id,
        provider=failing_provider,
    ) as client:
        response = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FOLLOW_UP_CONTENT},
            headers={"Origin": settings.frontend_origin},
        )
        history_response = await client.get(
            f"/api/conversations/{conversation_id}/messages",
        )

    assert response.status_code == 502
    assert [message["role"] for message in history_response.json()] == ["user", "assistant"]


@pytest.mark.anyio
async def test_send_message_uses_bounded_recent_history(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = await persist_user(session_factory, "Context budget")
    provider = FakeConversationProvider([FIRST_REPLY, "second reply", "third reply"])

    async with make_client(session_factory, user_id=user_id, provider=provider) as client:
        create_response = await client.post(
            "/api/conversations",
            json={"message": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        conversation_id = create_response.json()["id"]

        first_send = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FIRST_MESSAGE},
            headers={"Origin": settings.frontend_origin},
        )
        assert first_send.status_code == 200

        first_follow_up = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": FOLLOW_UP_CONTENT},
            headers={"Origin": settings.frontend_origin},
        )
        assert first_follow_up.status_code == 200

        monkeypatch.setattr(settings, "chat_context_max_messages", 3)
        second_follow_up = await client.post(
            f"/api/conversations/{conversation_id}/messages",
            json={"content": "第三天去哪里？"},
            headers={"Origin": settings.frontend_origin},
        )

    assert second_follow_up.status_code == 200
    assert [(message.role, message.content) for message in provider.requests[-1].messages[1:]] == [
        ("assistant", FIRST_REPLY),
        ("user", FOLLOW_UP_CONTENT),
        ("assistant", "second reply"),
        ("user", "第三天去哪里？"),
    ]


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
