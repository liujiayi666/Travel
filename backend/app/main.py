import time

from fastapi import FastAPI

from app.core.config import settings
from app.core.db import check_database


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

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
