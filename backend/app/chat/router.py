from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user, require_trusted_origin
from app.auth.models import User
from app.chat.presenter import to_chat_response
from app.chat.schemas import ChatRequest, ChatResponse
from app.chat.service import answer_message
from app.llm.contracts import LlmMessage, LlmProvider, LlmRequest
from app.llm.dependencies import get_llm_provider

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_trusted_origin)])
async def chat(
    payload: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    provider: Annotated[LlmProvider, Depends(get_llm_provider)],
) -> ChatResponse:
    request = LlmRequest(
        messages=[
            LlmMessage(role="user", content=payload.message),
        ],
    )
    reply = await answer_message(provider, request=request)
    return to_chat_response(reply)
