import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.agent.errors import AgentMaxStepsReachedError, AgentRunError, AgentTokenBudgetExceededError

logger = logging.getLogger(__name__)


def install_agent_error_handler(app: FastAPI) -> None:
    @app.exception_handler(AgentRunError)
    async def handle_agent_run_error(
        request: Request,
        exc: AgentRunError,
    ) -> JSONResponse:
        logger.warning(
            "Agent run terminated",
            extra={
                "error_code": exc.code,
                "error_type": type(exc).__name__,
                "path": request.url.path,
            },
        )

        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "code": exc.code,
                "detail": "The agent could not finish within its allowed steps.",
            },
        )

    @app.exception_handler(AgentMaxStepsReachedError)
    async def handle_agent_max_step_reached(
        request: Request,
        exc: AgentMaxStepsReachedError,
    ) -> JSONResponse:
        logger.warning(
            "Agent run max step",
            extra={
                "error_code": exc.code,
                "error_type": type(exc).__name__,
                "path": request.url.path,
            },
        )

        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "code": exc.code,
                "detail": "The agent could not finish within its allowed steps.",
            },
        )

    @app.exception_handler(AgentTokenBudgetExceededError)
    async def handle_agent_token_budget_exceeded(
        request: Request,
        exc: AgentTokenBudgetExceededError,
    ) -> JSONResponse:
        logger.warning(
            "Agent token budget exceeded",
            extra={
                "error_code": exc.code,
                "error_type": type(exc).__name__,
                "path": request.url.path,
            },
        )

        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "code": exc.code,
                "detail": "The agent exceeded its token budget.",
            },
        )
