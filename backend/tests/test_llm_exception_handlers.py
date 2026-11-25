import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.llm.errors import (
    LlmInvalidRequestError,
    LlmNotConfiguredError,
    LlmProviderError,
    LlmTimeoutError,
)
from app.llm.exception_handlers import install_llm_error_handlers


@pytest.mark.parametrize(
    ("error", "status_code", "error_code", "detail"),
    [
        (
            LlmNotConfiguredError("private configuration details"),
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "llm_not_configured",
            "Language model is not configured",
        ),
        (
            LlmTimeoutError("private timeout details"),
            status.HTTP_504_GATEWAY_TIMEOUT,
            "llm_timeout",
            "Language model request timed out",
        ),
        (
            LlmProviderError("private upstream response"),
            status.HTTP_502_BAD_GATEWAY,
            "llm_provider_error",
            "Language model request failed",
        ),
        (
            LlmInvalidRequestError("private internal request"),
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal_error",
            "Internal server error",
        ),
    ],
)
def test_llm_error_handler_returns_stable_public_response(
    error: Exception,
    status_code: int,
    error_code: str,
    detail: str,
) -> None:
    app = FastAPI()
    install_llm_error_handlers(app)

    @app.get("/fail")
    async def fail() -> None:
        raise error

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/fail")

    assert response.status_code == status_code
    assert response.json() == {
        "code": error_code,
        "detail": detail,
    }
    assert error.args[0] not in response.text
