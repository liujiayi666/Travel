from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.main as main_module
from app.llm.contracts import LlmAssistantMessage, LlmRequest, LlmResponse, LlmUsage


class FakeProvider:
    async def complete(self, request: LlmRequest) -> LlmResponse:
        return LlmResponse(
            message=LlmAssistantMessage(role="assistant", content="ok"),
            usage=LlmUsage(input_tokens=1, output_tokens=1),
        )


class FakeClient:
    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class FakeToolClient(FakeClient):
    async def aclose(self) -> None:
        self.closed = True


class FakeToolRuntime:
    def __init__(self) -> None:
        self.registry = object()
        self.client = FakeToolClient()


def test_lifespan_exposes_and_closes_llm_runtime(
    monkeypatch,
) -> None:
    provider = FakeProvider()
    client = FakeClient()
    runtime = SimpleNamespace(provider=provider, client=client)
    tool_runtime = FakeToolRuntime()
    monkeypatch.setattr(main_module, "create_llm_runtime", lambda: runtime)
    monkeypatch.setattr(main_module, "create_tool_runtime", lambda: tool_runtime)

    app = main_module.create_app()

    with TestClient(app):
        assert app.state.llm_runtime is runtime
        assert app.state.llm_provider is provider
        assert app.state.llm_client is client
        assert app.state.tool_runtime is tool_runtime

    assert client.closed is True
    assert tool_runtime.client.closed is True
