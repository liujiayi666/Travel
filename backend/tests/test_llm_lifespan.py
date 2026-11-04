from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.main as main_module
from app.llm.contracts import LlmAssistantMessage, LlmRequest, LlmResponse


class FakeProvider:
    async def complete(self, request: LlmRequest) -> LlmResponse:
        return LlmResponse(message=LlmAssistantMessage(role="assistant", content="ok"))


class FakeClient:
    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def test_lifespan_exposes_and_closes_llm_runtime(
    monkeypatch,
) -> None:
    provider = FakeProvider()
    client = FakeClient()
    runtime = SimpleNamespace(provider=provider, client=client)
    monkeypatch.setattr(main_module, "create_llm_runtime", lambda: runtime)

    app = main_module.create_app()

    with TestClient(app):
        assert app.state.llm_runtime is runtime
        assert app.state.llm_provider is provider
        assert app.state.llm_client is client

    assert client.closed is True
