import json
import logging
import uuid
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
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
    MessageExchangeCompleted,
    create_conversation,
    list_conversations,
    list_messages,
    prepare_message_stream,
    send_message,
    stream_message,
)
from app.core.db import get_db
from app.llm.contracts import LlmProvider, LlmTextDelta
from app.llm.dependencies import get_llm_provider
from app.llm.errors import LlmProviderError, LlmTimeoutError

router = APIRouter(prefix="/api/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)


def encode_sse_event(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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


@router.post(
    "/{conversation_id}/messages/stream",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_trusted_origin)],
)
async def stream_conversation_message(
    session: Annotated[AsyncSession, Depends(get_db)],
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    payload: SendMessageRequest,
    provider: Annotated[LlmProvider, Depends(get_llm_provider)],
):
    prepared = await prepare_message_stream(
        session,
        user_id=user.id,
        conversation_id=conversation_id,
        content=payload.content,
    )

    run_id = str(uuid.uuid4())

    async def event_stream():
        yield encode_sse_event(
            "run.started", {"runId": run_id, "conversationId": str(conversation_id)}
        )

        try:
            async with aclosing(
                stream_message(
                    session,
                    provider,
                    prepared_message_stream=prepared,
                )
            ) as message_stream:
                async for event in message_stream:
                    if isinstance(event, LlmTextDelta):
                        yield encode_sse_event(
                            "text.delta",
                            {
                                "runId": run_id,
                                "delta": event.text,
                            },
                        )

                        continue
                    if isinstance(event, MessageExchangeCompleted):
                        user_message = MessageResponse.model_validate(
                            event.user_message
                        ).model_dump(mode="json")
                        assistant_message = MessageResponse.model_validate(
                            event.assistant_message
                        ).model_dump(mode="json")
                        yield encode_sse_event(
                            "run.completed",
                            {
                                "runId": run_id,
                                "userMessage": user_message,
                                "assistantMessage": assistant_message,
                            },
                        )

        except LlmTimeoutError:
            yield encode_sse_event(
                "run.failed",
                {
                    "runId": str(run_id),
                    "code": "provider_timeout",
                    "message": "The language model request timed out.",
                },
            )

        except LlmProviderError as exc:
            cause = exc.__cause__
            logger.warning(
                "LLM stream failed run_id=%s error_type=%s status_code=%s error=%s",
                run_id,
                type(cause).__name__ if cause is not None else type(exc).__name__,
                getattr(cause, "status_code", None),
                str(exc),
            )

            yield encode_sse_event(
                "run.failed",
                {
                    "runId": str(run_id),
                    "code": "provider_error",
                    "message": "The language model could not finish the response.",
                },
            )
        except Exception:
            logger.exception("Streaming conversation message failed")
            yield encode_sse_event(
                "run.failed",
                {
                    "runId": str(run_id),
                    "code": "internal_error",
                    "message": "The response could not be completed.",
                },
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
