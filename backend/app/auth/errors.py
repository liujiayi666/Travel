from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.auth.service import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidSessionError,
)


def install_auth_error_handlers(app: FastAPI) -> None:

    @app.exception_handler(EmailAlreadyRegisteredError)
    async def handle_duplicate_email(
        request: Request,
        exc: EmailAlreadyRegisteredError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": "Email already registered"},
        )

    @app.exception_handler(InvalidCredentialsError)
    async def handle_invalid_credentials(
        request: Request,
        exc: InvalidCredentialsError,
    ) -> JSONResponse:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    @app.exception_handler(InvalidSessionError)
    async def handle_invalid_session(
        request: Request,
        exc: InvalidSessionError,
    ) -> JSONResponse:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
