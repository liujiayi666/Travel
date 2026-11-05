import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.errors import ConversationNotFoundError
from app.conversations.models import Conversation, Message


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
    """List messages for a conversation with pagination."""

    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )

    if conversation is None:
        raise ConversationNotFoundError()

    messages = (
        await session.scalars(
            select(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Message.conversation_id == conversation_id)
            .where(Conversation.user_id == user_id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    if not messages:
        return []
    return list(reversed(messages))
