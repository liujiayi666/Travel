from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.conversations.router import router as conversation_router


def register_routers(app: FastAPI):
    app.include_router(auth_router)
    app.include_router(chat_router)
    app.include_router(conversation_router)
