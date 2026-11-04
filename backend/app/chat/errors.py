import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.llm.errors import (
    LlmNotConfiguredError,
    LlmProviderError,
    LlmTimeoutError,
)

logger = logging.getLogger(__name__)


def install_chat_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(LlmProviderError)
    async def llm_provider_error_handler(
        request: Request,
        exc: LlmProviderError,
    ) -> JSONResponse:
        logger.error(
            "LLM provider request failed",
            extra={
                "error_code": "llm_provider_error",
                "path": request.url.path,
            },
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "code": "llm_provider_error",
                "detail": "Language model request failed",
            },
        )

    @app.exception_handler(LlmTimeoutError)
    async def llm_timeout_error_handler(
        request: Request,
        exc: LlmTimeoutError,
    ) -> JSONResponse:
        logger.warning(
            "LLM request timed out",
            extra={
                "error_code": "llm_timeout",
                "path": request.url.path,
            },
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            content={
                "code": "llm_timeout",
                "detail": "Language model request timed out",
            },
        )

    @app.exception_handler(LlmNotConfiguredError)
    async def llm_not_configured_error_handler(
        request: Request,
        exc: LlmNotConfiguredError,
    ) -> JSONResponse:
        logger.error(
            "LLM provider is not configured",
            extra={
                "error_code": "llm_not_configured",
                "path": request.url.path,
            },
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "code": "llm_not_configured",
                "detail": "Language model is not configured",
            },
        )
