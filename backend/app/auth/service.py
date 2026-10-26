from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from anyio import to_thread
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthSession, User
from app.core.config import settings
from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InvalidSessionError(Exception):
    pass


@dataclass(frozen=True)
class IssuedSession:
    user: User
    session_token: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def register_user(
    session: AsyncSession, *, email: str, password: str, display_name: str
) -> IssuedSession:
    normalized_email = normalize_email(email)
    hashed_password = await to_thread.run_sync(hash_password, password)
    user = User(email=normalized_email, password_hash=hashed_password, display_name=display_name)
    session.add(user)

    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise EmailAlreadyRegisteredError() from exc

    issued_auth_session = _issue_auth_session(session, user)
    await session.commit()
    return issued_auth_session


async def login_user(session: AsyncSession, *, email: str, password: str) -> IssuedSession:
    normalized_email = normalize_email(email)
    result = await session.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidCredentialsError()
    valid = await to_thread.run_sync(
        verify_password,
        password,
        user.password_hash,
    )
    if not valid:
        raise InvalidCredentialsError()
    issued_auth_session = _issue_auth_session(session, user)
    await session.commit()
    return issued_auth_session


async def logout_user(session: AsyncSession, *, session_token: str) -> None:
    # session_token       原始 token，交给未来 Cookie
    # session_token_hash  SHA-256 摘要，存入数据库
    # auth_session        ORM 对象
    hashed_session_token = hash_session_token(session_token)
    await session.execute(delete(AuthSession).where(AuthSession.token_hash == hashed_session_token))
    await session.commit()


async def get_user_for_session(session: AsyncSession, *, session_token: str) -> User:
    result = await session.execute(
        select(User)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(
            AuthSession.token_hash == hash_session_token(session_token),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidSessionError()

    return user


def _issue_auth_session(session: AsyncSession, user: User) -> IssuedSession:
    session_token = generate_session_token()
    session_token_hash = hash_session_token(session_token)
    expires_time = datetime.now(UTC) + timedelta(days=settings.session_ttl_days)
    auth_session = AuthSession(
        user_id=user.id, token_hash=session_token_hash, expires_at=expires_time
    )
    session.add(auth_session)
    return IssuedSession(user=user, session_token=session_token)
