from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from anyio import to_thread
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthSession, User
from app.core.config import settings
from app.core.security import generate_session_token, hash_password, hash_session_token


class EmailAlreadyRegisteredError(Exception):
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

    # session_token       原始 token，交给未来 Cookie
    # session_token_hash  SHA-256 摘要，存入数据库
    # auth_session        ORM 对象
    user_id = user.id
    session_token = generate_session_token()
    session_token_hash = hash_session_token(session_token)
    expires_time = datetime.now(UTC) + timedelta(days=settings.session_ttl_days)
    auth_session = AuthSession(
        user_id=user_id, token_hash=session_token_hash, expires_at=expires_time
    )
    session.add(auth_session)

    await session.commit()
    return IssuedSession(user=user, session_token=session_token)
