import time
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI

from app.agent.tools.dependencies import create_tool_runtime
from app.api.router import register_routers
from app.core.config import settings
from app.core.db import check_database
from app.core.exception_handler import register_exception_handlers
from app.llm.dependencies import create_llm_runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    llm_runtime = create_llm_runtime()
    tool_runtime = create_tool_runtime()
    app.state.llm_runtime = llm_runtime
    app.state.tool_runtime = tool_runtime

    if llm_runtime is not None:
        app.state.llm_provider = llm_runtime.provider
        app.state.llm_client = llm_runtime.client

    async with AsyncExitStack() as stack:
        stack.push_async_callback(tool_runtime.client.aclose)

        if llm_runtime is not None:
            stack.push_async_callback(llm_runtime.client.close)
            app.state.llm_runtime = llm_runtime

        yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.state.llm_runtime = None
    app.state.llm_provider = None
    app.state.llm_client = None
    app.state.tool_runtime = None

    register_exception_handlers(app)
    register_routers(app)

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
