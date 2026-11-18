import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.agent.errors import AgentRunError

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
