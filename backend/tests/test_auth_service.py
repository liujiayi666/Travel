import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.auth.models import AuthSession, User
from app.auth.service import (
    EmailAlreadyRegisteredError,
    normalize_email,
    register_user,
)
from app.core.config import settings
from app.core.security import hash_session_token


def create_test_session_factory() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
        autoflush=False,
    )
    return engine, session_factory


def test_normalize_email_trims_and_lowercases() -> None:
    assert normalize_email("  Alice@Example.COM  ") == "alice@example.com"


@pytest.mark.anyio
async def test_register_user_persists_user_and_hashed_session() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    password = "integration-password"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            issued = await register_user(
                session,
                email=f"  {email.upper()}  ",
                password=password,
                display_name="Integration User",
            )
            persisted_user_id = issued.user.id
            user_id = persisted_user_id

        async with session_factory() as session:
            user = await session.get(User, persisted_user_id)
            auth_sessions = (
                await session.scalars(
                    select(AuthSession).where(AuthSession.user_id == persisted_user_id)
                )
            ).all()

        assert user is not None
        assert user.email == email
        assert user.password_hash != password
        assert user.password_hash.startswith("$argon2id$")

        assert len(auth_sessions) == 1
        stored_session = auth_sessions[0]
        assert stored_session.token_hash == hash_session_token(issued.session_token)
        assert stored_session.token_hash != issued.session_token
        assert stored_session.expires_at > datetime.now(UTC)
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_register_user_rolls_back_duplicate_email() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            issued = await register_user(
                session,
                email=email,
                password="first-password",
                display_name="First User",
            )
            persisted_user_id = issued.user.id
            user_id = persisted_user_id

        async with session_factory() as session:
            with pytest.raises(EmailAlreadyRegisteredError):
                await register_user(
                    session,
                    email=f"  {email.upper()}  ",
                    password="second-password",
                    display_name="Second User",
                )

            users = (await session.scalars(select(User).where(User.email == email))).all()
            auth_sessions = (
                await session.scalars(
                    select(AuthSession).where(AuthSession.user_id == persisted_user_id)
                )
            ).all()

        assert len(users) == 1
        assert len(auth_sessions) == 1
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()
