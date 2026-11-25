from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.agent.errors import get_agent_run_error_metadata


class ConversationNotFoundError(Exception):
    pass


class ConversationBusyError(Exception):
    pass


def install_conversation_message_error(app: FastAPI) -> None:
    @app.exception_handler(ConversationNotFoundError)
    async def handle_conversation_not_found(
        request: Request,
        exc: ConversationNotFoundError,
    ) -> JSONResponse:
        run_id_fields, run_id_headers = get_agent_run_error_metadata(exc)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Conversation not found", **run_id_fields},
            headers=run_id_headers,
        )

    @app.exception_handler(ConversationBusyError)
    async def handle_conversation_busy(
        request: Request,
        exc: ConversationBusyError,
    ) -> JSONResponse:
        run_id_fields, run_id_headers = get_agent_run_error_metadata(exc)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "Conversation is busy", **run_id_fields},
            headers=run_id_headers,
        )
