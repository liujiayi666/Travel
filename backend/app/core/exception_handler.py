from fastapi import FastAPI

from app.agent.exception_handler import install_agent_error_handler
from app.agent.tools.exception_handlers import install_tool_error_handler
from app.auth.errors import install_auth_error_handlers
from app.conversations.errors import install_conversation_message_error
from app.llm.exception_handlers import install_llm_error_handlers


def register_exception_handlers(app: FastAPI) -> None:
    install_auth_error_handlers(app)
    install_llm_error_handlers(app)
    install_conversation_message_error(app)
    install_tool_error_handler(app)
    install_agent_error_handler(app)
