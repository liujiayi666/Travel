import uuid

from app.conversations.presenter import to_send_message_response
from app.llm.contracts import LlmAssistantMessage


def test_send_message_presenter_maps_only_public_message_fields() -> None:
    run_id = uuid.uuid4()
    response = to_send_message_response(
        LlmAssistantMessage(role="assistant", content="去西湖。"),
        run_id=run_id,
    )

    assert response.model_dump() == {
        "run_id": run_id,
        "message": {
            "role": "assistant",
            "content": "去西湖。",
        },
    }
