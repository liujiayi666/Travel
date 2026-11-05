import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.conversations.schemas import ConversationResponse, MessagesResponse
from app.conversations.service import list_conversations, list_messages
from app.core.db import get_db

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationResponse])
async def get_conversations(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
    ),
    offset: int = Query(default=0, ge=0),
):
    conversationList = await list_conversations(
        session=session, user_id=user.id, limit=limit, offset=offset
    )
    return conversationList


@router.get("/{conversation_id}/messages", response_model=list[MessagesResponse])
async def get_messages_of_conversation(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    conversation_id: uuid.UUID,
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
    ),
    offset: int = Query(default=0, ge=0),
):
    messages = await list_messages(
        session, conversation_id=conversation_id, user_id=user.id, limit=limit, offset=offset
    )

    return messages
