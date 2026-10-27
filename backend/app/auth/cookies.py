from fastapi import Response

from app.core.config import settings


def set_auth_cookie(response: Response, session_token: str) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=session_token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
    )
