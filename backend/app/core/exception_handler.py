from fastapi import FastAPI

from app.auth.errors import install_auth_error_handlers
from app.chat.errors import install_chat_error_handlers
from app.conversations.errors import install_conversation_message_error


def register_exception_handlers(app: FastAPI) -> None:
    install_auth_error_handlers(app)
    install_chat_error_handlers(app)
    install_conversation_message_error(app)
