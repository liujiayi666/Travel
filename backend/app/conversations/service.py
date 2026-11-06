import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.service import answer_message
from app.conversations.errors import ConversationNotFoundError
from app.conversations.models import Conversation, Message
from app.core.config import settings
from app.llm.contracts import LlmAssistantMessage, LlmMessage, LlmProvider, LlmRequest

SYSTEM_PROMPT = (
    "You are Travel Copilot, a concise travel planning assistant. "
    "Use the supplied conversation history and answer the latest user message."
)
DEFAULT_CONVERSATION_TITLE = "New conversation"
MAX_TITLE_CHARS = 50


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
    conversation: Conversation,
    content: str,
    assistant_content: str,
) -> tuple[Message, Message]:
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
    session.add_all([conversation, user_message, assistant_message])

    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return user_message, assistant_message


async def create_conversation(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> Conversation:
    """Create an empty conversation owned by the current user."""
    conversation = Conversation(user_id=user_id, title=DEFAULT_CONVERSATION_TITLE)
    session.add(conversation)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return conversation


async def send_message(
    session: AsyncSession,
    provider: LlmProvider,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    content: str,
) -> LlmAssistantMessage:
    conversation = (
        await session.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .where(Conversation.user_id == user_id)
        )
    ).scalar_one_or_none()

    if conversation is None:
        raise ConversationNotFoundError()

    history = await _list_recent_messages(
        session,
        conversation_id=conversation_id,
        limit=settings.chat_context_max_messages,
    )
    if not history:
        conversation.title = build_conversation_title(content)
    reply = await answer_message(
        provider,
        request=LlmRequest(messages=build_context(history=history, content=content)),
    )
    await _persist_exchange(
        session,
        conversation=conversation,
        content=content,
        assistant_content=reply.content,
    )
    return reply
