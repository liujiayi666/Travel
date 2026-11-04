from app.chat.schemas import ChatResponse, ChatResponseMessage
from app.llm.contracts import LlmAssistantMessage


def to_chat_response(message: LlmAssistantMessage) -> ChatResponse:
    """Map internal LLM output to the public API response by allowlist."""
    return ChatResponse(
        message=ChatResponseMessage(
            role="assistant",
            content=message.content,
        ),
    )
