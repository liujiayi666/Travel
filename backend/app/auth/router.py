from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.cookies import clear_auth_cookie, set_auth_cookie
from app.auth.dependencies import (
    get_current_user,
    get_optional_session_token,
    require_trusted_origin,
)
from app.auth.models import User
from app.auth.schemas import LoginRequest, RegisterRequest, UserResponse
from app.auth.service import login_user, logout_user, register_user
from app.core.db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_trusted_origin)],
)
async def register(
    payload: RegisterRequest, response: Response, session: Annotated[AsyncSession, Depends(get_db)]
) -> User:
    issued_user = await register_user(
        session, email=payload.email, password=payload.password, display_name=payload.display_name
    )
    set_auth_cookie(response, issued_user.session_token)
    return issued_user.user


@router.post(
    "/login",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_trusted_origin)],
)
async def login(
    payload: LoginRequest, response: Response, session: Annotated[AsyncSession, Depends(get_db)]
) -> User:
    issued_user = await login_user(session, email=payload.email, password=payload.password)
    set_auth_cookie(response, issued_user.session_token)
    return issued_user.user


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_trusted_origin)],
)
async def logout(
    response: Response,
    session_token: Annotated[str | None, Depends(get_optional_session_token)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if session_token:
        await logout_user(session, session_token=session_token)

    clear_auth_cookie(response)


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user
