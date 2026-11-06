import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_trusted_origin
from app.auth.models import User
from app.chat.presenter import to_chat_response
from app.chat.schemas import ChatResponse
from app.conversations.schemas import (
    ConversationCreateRequest,
    ConversationResponse,
    MessageResponse,
    SendMessageRequest,
)
from app.conversations.service import (
    create_conversation,
    list_conversations,
    list_messages,
    send_message,
)
from app.core.db import get_db
from app.llm.contracts import LlmProvider
from app.llm.dependencies import get_llm_provider

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


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
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


@router.post(
    "",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_trusted_origin)],
)
async def create_new_conversation(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    payload: ConversationCreateRequest,
):
    return await create_conversation(
        session,
        user_id=user.id,
        message=payload.message,
    )


@router.post(
    "/{conversation_id}/messages",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_trusted_origin)],
)
async def send_conversation_message(
    session: Annotated[AsyncSession, Depends(get_db)],
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    payload: SendMessageRequest,
    provider: Annotated[LlmProvider, Depends(get_llm_provider)],
):
    reply = await send_message(
        session,
        provider,
        conversation_id=conversation_id,
        user_id=user.id,
        content=payload.content,
    )
    return to_chat_response(reply)
