from app.llm.contracts import (
    LlmAssistantMessage,
    LlmProvider,
    LlmRequest,
    LlmResponse,
)


async def answer_message(provider: LlmProvider, request: LlmRequest) -> LlmAssistantMessage:

    response = await provider.complete(request)
    return response.message
