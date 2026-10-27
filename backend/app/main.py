import time

from fastapi import FastAPI

from app.auth.errors import install_auth_error_handlers
from app.auth.router import router as auth_router
from app.core.config import settings
from app.core.db import check_database


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    install_auth_error_handlers(app)
    app.include_router(auth_router)

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
