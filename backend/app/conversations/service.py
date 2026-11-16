import uuid
from collections.abc import AsyncGenerator
from contextlib import aclosing
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.service import answer_message
from app.conversations.errors import (
    ConversationBusyError,
    ConversationNotFoundError,
)
from app.conversations.models import Conversation, Message
from app.core.config import settings
from app.llm.contracts import LlmAssistantMessage, LlmMessage, LlmProvider, LlmRequest, LlmTextDelta
from app.llm.errors import LlmProviderError

SYSTEM_PROMPT = (
    "You are Travel Copilot, a concise travel planning assistant. "
    "Use the supplied conversation history and answer the latest user message."
)
DEFAULT_CONVERSATION_TITLE = "New conversation"
MAX_TITLE_CHARS = 50


@dataclass(frozen=True)
class PreparedMessageStream:
    conversation: Conversation
    request: LlmRequest
    content: str
    lease_token: uuid.UUID


@dataclass(frozen=True)
class MessageExchangeCompleted:
    user_message: Message
    assistant_message: Message


async def list_conversations(
    session: AsyncSession, *, user_id: uuid.UUID, limit: int = 10, offset: int = 0
) -> list[Conversation]:
    """List conversations for a user with pagination."""
    result = (
        await session.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    if not result:
        return []

    return list(result)


async def list_messages(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    limit: int = 10,
    offset: int = 0,
) -> list[Message]:
    """List messages for an owned conversation with pagination."""
    owned_conversation_id = await session.scalar(
        select(Conversation.id).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )
    if owned_conversation_id is None:
        raise ConversationNotFoundError()

    return await _list_recent_messages(
        session,
        conversation_id=conversation_id,
        limit=limit,
        offset=offset,
    )


async def _list_recent_messages(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    limit: int = 10,
    offset: int = 0,
) -> list[Message]:
    messages = (
        await session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    if not messages:
        return []
    return list(reversed(messages))


def build_context(*, history: list[Message], content: str) -> list[LlmMessage]:
    system = LlmMessage(role="system", content=SYSTEM_PROMPT)
    current = LlmMessage(role="user", content=content)
    remaining = settings.chat_context_max_chars - len(system.content) - len(current.content)
    selected: list[Message] = []

    for message in reversed(history):
        message_cost = len(message.content)
        if message_cost > remaining:
            break
        selected.append(message)
        remaining -= message_cost

    selected.reverse()
    return [
        system,
        *[LlmMessage(role=message.role, content=message.content) for message in selected],
        current,
    ]


def build_conversation_title(content: str) -> str:
    """Build a deterministic title from the first user message."""
    normalized = " ".join(content.split())
    return normalized[:MAX_TITLE_CHARS] or DEFAULT_CONVERSATION_TITLE


async def _persist_exchange(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    lease_token: uuid.UUID,
    content: str,
    assistant_content: str,
) -> tuple[Message, Message]:
    conversation = (
        await session.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()

    if conversation is None:
        await session.rollback()
        raise ConversationNotFoundError()

    if conversation.processing_token != lease_token:
        await session.rollback()
        raise ConversationBusyError()

    user_created_at = datetime.now(UTC)
    assistant_created_at = max(
        datetime.now(UTC),
        user_created_at + timedelta(microseconds=1),
    )

    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=content,
        created_at=user_created_at,
    )
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=assistant_content,
        created_at=assistant_created_at,
    )

    conversation.updated_at = assistant_created_at
    conversation.processing_token = None
    conversation.processing_expires_at = None

    session.add_all([conversation, user_message, assistant_message])

    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return user_message, assistant_message


async def prepare_message_stream(
    session: AsyncSession, *, user_id: uuid.UUID, conversation_id: uuid.UUID, content: str
) -> PreparedMessageStream:
    conversation, lease_token = await _claim_conversation_lease(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    try:
        history = await _list_recent_messages(
            session,
            conversation_id=conversation_id,
            limit=settings.chat_context_max_messages,
        )

        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return PreparedMessageStream(
        conversation=conversation,
        request=LlmRequest(
            messages=build_context(history=history, content=content),
        ),
        content=content,
        lease_token=lease_token,
    )


async def _claim_conversation_lease(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> tuple[Conversation, uuid.UUID]:
    lease_token = uuid.uuid4()

    claim_statement = (
        update(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
            or_(
                Conversation.processing_token.is_(None),
                Conversation.processing_expires_at <= func.now(),
            ),
        )
        .values(
            processing_token=lease_token,
            processing_expires_at=(
                func.now() + timedelta(seconds=settings.conversation_lease_seconds)
            ),
        )
        .returning(Conversation)
        .execution_options(synchronize_session=False)
    )

    conversation = (await session.execute(claim_statement)).scalar_one_or_none()

    if conversation is None:
        owned_conversation_id = await session.scalar(
            select(Conversation.id).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        await session.rollback()

        if owned_conversation_id is None:
            raise ConversationNotFoundError()

        raise ConversationBusyError()

    return conversation, lease_token


async def create_conversation(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    message: str,
) -> Conversation:
    """Create a conversation titled from the message supplied by the client."""
    conversation = Conversation(
        user_id=user_id,
        title=build_conversation_title(message),
    )
    session.add(conversation)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return conversation


async def _release_conversation_lease(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    lease_token: uuid.UUID,
) -> None:
    try:
        await session.execute(
            update(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.processing_token == lease_token,
            )
            .values(
                processing_token=None,
                processing_expires_at=None,
            )
            .execution_options(synchronize_session=False)
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise


async def send_message(
    session: AsyncSession,
    provider: LlmProvider,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    content: str,
) -> LlmAssistantMessage:

    prepared_message_stream = await prepare_message_stream(
        session, user_id=user_id, conversation_id=conversation_id, content=content
    )
    try:
        reply = await answer_message(
            provider,
            request=prepared_message_stream.request,
        )
        await _persist_exchange(
            session,
            conversation_id=conversation_id,
            lease_token=prepared_message_stream.lease_token,
            content=prepared_message_stream.content,
            assistant_content=reply.content,
        )
        return reply
    finally:
        await _release_conversation_lease(
            session,
            conversation_id=conversation_id,
            lease_token=prepared_message_stream.lease_token,
        )


async def stream_message(
    session: AsyncSession,
    provider: LlmProvider,
    *,
    prepared_message_stream: PreparedMessageStream,
) -> AsyncGenerator[LlmTextDelta | MessageExchangeCompleted, None]:
    parts: list[str] = []
    prepared = prepared_message_stream
    conversation_id = prepared.conversation.id

    try:
        async with aclosing(provider.stream(prepared.request)) as provider_stream:
            async for delta in provider_stream:
                parts.append(delta.text)
                yield delta

        assistant_content = "".join(parts)
        if not assistant_content.strip():
            raise LlmProviderError("Language model returned no text")

        user_message, assistant_message = await _persist_exchange(
            session,
            conversation_id=conversation_id,
            lease_token=prepared.lease_token,
            content=prepared.content,
            assistant_content=assistant_content,
        )

        yield MessageExchangeCompleted(
            user_message=user_message,
            assistant_message=assistant_message,
        )
    finally:
        await _release_conversation_lease(
            session,
            conversation_id=conversation_id,
            lease_token=prepared.lease_token,
        )
