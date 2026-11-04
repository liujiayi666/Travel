import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth.errors import install_auth_error_handlers
from app.auth.router import router as auth_router
from app.chat.errors import install_chat_error_handlers
from app.chat.router import router as chat_router
from app.core.config import settings
from app.core.db import check_database
from app.llm.dependencies import create_llm_runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    llm_runtime = create_llm_runtime()
    app.state.llm_runtime = llm_runtime

    if llm_runtime is not None:
        app.state.llm_provider = llm_runtime.provider
        app.state.llm_client = llm_runtime.client

    try:
        yield
    finally:
        if llm_runtime is not None:
            await llm_runtime.client.close()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.state.llm_runtime = None
    app.state.llm_provider = None
    app.state.llm_client = None

    install_auth_error_handlers(app)
    install_chat_error_handlers(app)

    app.include_router(auth_router)
    app.include_router(chat_router)

    @app.get("/healthz")
    @app.get("/api/healthz")
    async def healthz() -> dict:
        database = await check_database()
        return {
            "status": "ok" if database == "connected" else "degraded",
            "database": database,
            "time": time.time(),
        }

    return app


app = create_app()
