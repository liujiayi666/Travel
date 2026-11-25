import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.agent.errors import get_agent_run_error_metadata
from app.llm.errors import (
    LlmInvalidRequestError,
    LlmNotConfiguredError,
    LlmProviderError,
    LlmTimeoutError,
)

logger = logging.getLogger(__name__)


def install_llm_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(LlmInvalidRequestError)
    async def llm_invalid_request_error_handler(
        request: Request,
        exc: LlmInvalidRequestError,
    ) -> JSONResponse:
        logger.error(
            "Invalid internal LLM request",
            extra={
                "error_code": "internal_error",
                "path": request.url.path,
            },
            exc_info=exc,
        )
        run_id_fields, run_id_headers = get_agent_run_error_metadata(exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "internal_error",
                "detail": "Internal server error",
                **run_id_fields,
            },
            headers=run_id_headers,
        )

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
        run_id_fields, run_id_headers = get_agent_run_error_metadata(exc)
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "code": "llm_provider_error",
                "detail": "Language model request failed",
                **run_id_fields,
            },
            headers=run_id_headers,
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
        run_id_fields, run_id_headers = get_agent_run_error_metadata(exc)
        return JSONResponse(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            content={
                "code": "llm_timeout",
                "detail": "Language model request timed out",
                **run_id_fields,
            },
            headers=run_id_headers,
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
        run_id_fields, run_id_headers = get_agent_run_error_metadata(exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "code": "llm_not_configured",
                "detail": "Language model is not configured",
                **run_id_fields,
            },
            headers=run_id_headers,
        )
