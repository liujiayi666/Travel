import uuid

from app.conversations.schemas import AssistantMessageResponse, SendMessageResponse
from app.llm.contracts import LlmAssistantMessage


def to_send_message_response(
    message: LlmAssistantMessage,
    *,
    run_id: uuid.UUID,
) -> SendMessageResponse:
    """Map internal LLM output to the public response by allowlist."""
    return SendMessageResponse(
        run_id=run_id,
        message=AssistantMessageResponse(
            role="assistant",
            content=message.content,
        ),
    )
