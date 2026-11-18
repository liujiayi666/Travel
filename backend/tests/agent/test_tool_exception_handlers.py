import logging

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.agent.tools.error import (
    ToolError,
    ToolExecutionError,
    ToolInvalidArgumentsError,
    ToolNotAllowedError,
    ToolTimeoutError,
)
from app.agent.tools.exception_handlers import install_tool_error_handler


@pytest.mark.parametrize(
    ("error", "expected_status", "expected_code", "expected_detail"),
    [
        (
            ToolNotAllowedError("dangerous_private_tool"),
            status.HTTP_502_BAD_GATEWAY,
            "tool_not_allowed",
            "The requested tool is not available.",
        ),
        (
            ToolInvalidArgumentsError("private destination Hangzhou"),
            status.HTTP_502_BAD_GATEWAY,
            "tool_invalid_arguments",
            "The language model returned invalid tool arguments.",
        ),
        (
            ToolTimeoutError("private timeout details"),
            status.HTTP_504_GATEWAY_TIMEOUT,
            "tool_timeout",
            "The tool request timed out.",
        ),
        (
            ToolExecutionError("private upstream response"),
            status.HTTP_502_BAD_GATEWAY,
            "tool_execution_error",
            "The tool request failed.",
        ),
        (
            ToolError("unexpected private details"),
            status.HTTP_502_BAD_GATEWAY,
            "tool_error",
            "The tool request failed.",
        ),
    ],
)
def test_tool_error_handler_returns_stable_public_response(
    error: ToolError,
    expected_status: int,
    expected_code: str,
    expected_detail: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = FastAPI()
    install_tool_error_handler(app)

    @app.get("/fail")
    async def fail() -> None:
        raise error

    with (
        caplog.at_level(logging.WARNING),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        response = client.get("/fail")

    assert response.status_code == expected_status
    assert response.json() == {
        "code": expected_code,
        "detail": expected_detail,
    }
    assert error.args[0] not in response.text
    assert error.args[0] not in caplog.text
    record = caplog.records[-1]
    assert getattr(record, "error_code", None) == expected_code
    assert getattr(record, "error_type", None) == type(error).__name__
    assert getattr(record, "path", None) == "/fail"
