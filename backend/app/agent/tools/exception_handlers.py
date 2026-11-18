import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.agent.tools.errors import (
    ToolError,
    ToolExecutionError,
    ToolInvalidArgumentsError,
    ToolNotAllowedError,
    ToolTimeoutError,
)

logger = logging.getLogger(__name__)

TOOL_ERROR_RESPONSES: dict[type[ToolError], tuple[int, str]] = {
    ToolNotAllowedError: (
        status.HTTP_502_BAD_GATEWAY,
        "The requested tool is not available.",
    ),
    ToolInvalidArgumentsError: (
        status.HTTP_502_BAD_GATEWAY,
        "The language model returned invalid tool arguments.",
    ),
    ToolTimeoutError: (
        status.HTTP_504_GATEWAY_TIMEOUT,
        "The tool request timed out.",
    ),
    ToolExecutionError: (
        status.HTTP_502_BAD_GATEWAY,
        "The tool request failed.",
    ),
}


def install_tool_error_handler(app: FastAPI) -> None:
    @app.exception_handler(ToolError)
    async def handle_tool_error(
        request: Request,
        exc: ToolError,
    ) -> JSONResponse:
        status_code, detail = TOOL_ERROR_RESPONSES.get(
            type(exc),
            (
                status.HTTP_502_BAD_GATEWAY,
                "The tool request failed.",
            ),
        )

        logger.warning(
            "Tool request failed",
            extra={
                "error_code": exc.code,
                "error_type": type(exc).__name__,
                "path": request.url.path,
            },
        )

        return JSONResponse(
            status_code=status_code,
            content={
                "code": exc.code,
                "detail": detail,
            },
        )
