import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.chat.presenter import to_chat_response
from app.core.config import settings
from app.llm.contracts import (
    LlmAssistantMessage,
    LlmMessage,
    LlmProvider,
    LlmRequest,
    LlmResponse,
)
from app.llm.errors import LlmNotConfiguredError, LlmProviderError, LlmTimeoutError
from app.main import create_app


def make_payload(message: str = "杭州周末去哪玩？") -> dict:
    return {"message": message}


class FakeProvider:
    def __init__(self, *, response: LlmResponse | None = None, error: Exception | None = None):
        self.response = response
        self.error = error
        self.requests: list[LlmRequest] = []

    async def complete(self, request: LlmRequest) -> LlmResponse:
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        if self.response is None:
            raise AssertionError("FakeProvider has neither response nor error")
        return self.response


def make_client(
    provider: LlmProvider | None,
    *,
    authenticated: bool = True,
) -> tuple[TestClient, object]:
    app = create_app()
    app.state.llm_provider = provider

    if authenticated:
        user = SimpleNamespace(id=uuid.uuid4())
        app.dependency_overrides[get_current_user] = lambda: user

    return TestClient(app, raise_server_exceptions=False), app


def post_chat(
    client: TestClient,
    payload: dict,
    *,
    origin: str | None = settings.frontend_origin,
):
    headers = {"Origin": origin} if origin is not None else {}
    return client.post("/api/chat", json=payload, headers=headers)


def test_chat_requires_authentication() -> None:
    provider = FakeProvider(
        response=LlmResponse(message=LlmAssistantMessage(role="assistant", content="unused"))
    )
    client, _ = make_client(provider, authenticated=False)

    response = post_chat(client, make_payload())

    assert response.status_code == 401
    assert provider.requests == []


def test_chat_returns_only_the_assistant_message() -> None:
    provider = FakeProvider(
        response=LlmResponse(message=LlmAssistantMessage(role="assistant", content="去西湖。"))
    )
    client, _ = make_client(provider)

    response = post_chat(client, make_payload(" 杭州周末去哪玩？ "))

    assert response.status_code == 200
    assert response.json() == {
        "message": {
            "role": "assistant",
            "content": "去西湖。",
        }
    }
    assert provider.requests == [
        LlmRequest(messages=[LlmMessage(role="user", content="杭州周末去哪玩？")])
    ]


def test_presenter_maps_only_public_message_fields() -> None:
    response = to_chat_response(
        LlmAssistantMessage(role="assistant", content="去西湖。"),
    )

    assert response.model_dump() == {
        "message": {
            "role": "assistant",
            "content": "去西湖。",
        }
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": ""},
        {"message": "   "},
        {"message": "x" * 4001},
        {"message": None},
        {"message": 42},
        {"message": {"role": "user", "content": "客户端不负责包装 role/content"}},
        {"messages": [{"role": "user", "content": "旧协议不应被接受"}]},
    ],
)
def test_chat_rejects_invalid_message(payload: dict) -> None:
    provider = FakeProvider(
        response=LlmResponse(message=LlmAssistantMessage(role="assistant", content="unused"))
    )
    client, _ = make_client(provider)

    response = post_chat(client, payload)

    assert response.status_code == 422
    assert provider.requests == []


def test_chat_rejects_client_supplied_user_or_model_fields() -> None:
    provider = FakeProvider(
        response=LlmResponse(message=LlmAssistantMessage(role="assistant", content="unused"))
    )
    client, _ = make_client(provider)

    response = post_chat(
        client,
        {
            **make_payload(),
            "userId": str(uuid.uuid4()),
            "model": "attacker-selected-model",
        },
    )

    assert response.status_code == 422
    assert provider.requests == []


def test_chat_rejects_missing_untrusted_origin() -> None:
    provider = FakeProvider(
        response=LlmResponse(message=LlmAssistantMessage(role="assistant", content="unused"))
    )
    client, _ = make_client(provider)

    response = post_chat(client, make_payload(), origin=None)

    assert response.status_code == 403
    assert provider.requests == []


@pytest.mark.parametrize(
    ("error", "status_code", "error_code"),
    [
        (LlmNotConfiguredError(), 503, "llm_not_configured"),
        (LlmTimeoutError(), 504, "llm_timeout"),
        (LlmProviderError(), 502, "llm_provider_error"),
    ],
)
def test_chat_maps_provider_failures(
    error: Exception,
    status_code: int,
    error_code: str,
) -> None:
    provider = FakeProvider(error=error)
    client, _ = make_client(provider)

    response = post_chat(client, make_payload())

    assert response.status_code == status_code
    assert response.json()["code"] == error_code
    assert isinstance(response.json()["detail"], str)
