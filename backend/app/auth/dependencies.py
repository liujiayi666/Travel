from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.service import InvalidSessionError, get_user_for_session
from app.core.config import settings
from app.core.db import get_db


def get_optional_session_token(request: Request) -> str | None:
    session_token = request.cookies.get(settings.auth_cookie_name)

    return session_token


def get_session_token(
    session_token: Annotated[str | None, Depends(get_optional_session_token)],
) -> str:

    if not session_token:
        raise InvalidSessionError()

    return session_token


async def get_current_user(
    session_token: Annotated[str, Depends(get_session_token)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:

    return await get_user_for_session(session, session_token=session_token)


def require_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin != settings.frontend_origin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
