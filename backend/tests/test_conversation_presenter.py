from app.conversations.presenter import to_send_message_response
from app.llm.contracts import LlmAssistantMessage


def test_send_message_presenter_maps_only_public_message_fields() -> None:
    response = to_send_message_response(
        LlmAssistantMessage(role="assistant", content="去西湖。"),
    )

    assert response.model_dump() == {
        "message": {
            "role": "assistant",
            "content": "去西湖。",
        }
    }
