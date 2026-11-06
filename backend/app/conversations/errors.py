from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class ConversationNotFoundError(Exception):
    pass


def install_conversation_message_error(app: FastAPI) -> None:
    @app.exception_handler(ConversationNotFoundError)
    async def handle_conversation_not_found(
        request: Request,
        exc: ConversationNotFoundError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Conversation not found"}
        )
