from types import SimpleNamespace

import pytest
from pydantic import SecretStr

import app.llm.dependencies as llm_dependencies
from app.core.config import settings


@pytest.mark.parametrize(
    (
        "provider_name",
        "key_field",
        "base_url_field",
        "model_field",
        "expected_base_url",
        "expected_model",
    ),
    [
        (
            "deepseek",
            "deepseek_api_key",
            "deepseek_base_url",
            "deepseek_model",
            "https://deepseek.example/v1",
            "deepseek-test-model",
        ),
        (
            "glm",
            "glm_api_key",
            "glm_base_url",
            "glm_model",
            "https://glm.example/v4",
            "glm-test-model",
        ),
    ],
)
def test_create_llm_runtime_uses_selected_provider_config(
    monkeypatch: pytest.MonkeyPatch,
    provider_name: str,
    key_field: str,
    base_url_field: str,
    model_field: str,
    expected_base_url: str,
    expected_model: str,
) -> None:
    monkeypatch.setattr(settings, "llm_provider", provider_name)
    monkeypatch.setattr(settings, key_field, SecretStr("test-secret"))
    monkeypatch.setattr(settings, base_url_field, expected_base_url)
    monkeypatch.setattr(settings, model_field, expected_model)

    captured: dict = {}

    def fake_async_openai(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace()

    monkeypatch.setattr(llm_dependencies, "AsyncOpenAI", fake_async_openai)

    runtime = llm_dependencies.create_llm_runtime()

    assert runtime is not None
    assert runtime.provider.model == expected_model
    assert captured["api_key"] == "test-secret"
    assert captured["base_url"] == expected_base_url
    assert captured["timeout"] == settings.llm_timeout
    assert captured["max_retries"] == settings.llm_max_retries


def test_create_llm_runtime_returns_none_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "llm_provider", "deepseek")
    monkeypatch.setattr(settings, "deepseek_api_key", None)

    assert llm_dependencies.create_llm_runtime() is None
