import uuid
from datetime import UTC, datetime, timedelta

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
    InvalidCredentialsError,
    InvalidSessionError,
    get_user_for_session,
    login_user,
    logout_user,
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


@pytest.mark.anyio
async def test_login_user_creates_a_new_session() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    password = "integration-password"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            registered = await register_user(
                session,
                email=email,
                password=password,
                display_name="Login User",
            )
            persisted_user_id = registered.user.id
            user_id = persisted_user_id

        async with session_factory() as session:
            logged_in = await login_user(
                session,
                email=f"  {email.upper()}  ",
                password=password,
            )
            logged_in_token = logged_in.session_token

        async with session_factory() as session:
            user = await session.get(User, persisted_user_id)
            auth_sessions = (
                await session.scalars(
                    select(AuthSession).where(AuthSession.user_id == persisted_user_id)
                )
            ).all()

        assert user is not None
        assert logged_in_token != registered.session_token
        assert len(auth_sessions) == 2
        assert {item.token_hash for item in auth_sessions} == {
            hash_session_token(registered.session_token),
            hash_session_token(logged_in_token),
        }
        assert all(item.expires_at > datetime.now(UTC) for item in auth_sessions)
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_login_user_rejects_wrong_password_without_new_session() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            registered = await register_user(
                session,
                email=email,
                password="correct-password",
                display_name="Login User",
            )
            persisted_user_id = registered.user.id
            user_id = persisted_user_id

        async with session_factory() as session:
            with pytest.raises(InvalidCredentialsError):
                await login_user(
                    session,
                    email=email,
                    password="incorrect-password",
                )

            auth_sessions = (
                await session.scalars(
                    select(AuthSession).where(AuthSession.user_id == persisted_user_id)
                )
            ).all()

        assert len(auth_sessions) == 1
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_login_user_rejects_unknown_email() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"

    try:
        async with session_factory() as session:
            with pytest.raises(InvalidCredentialsError):
                await login_user(
                    session,
                    email=email,
                    password="unknown-password",
                )

            users = (await session.scalars(select(User).where(User.email == email))).all()

        assert users == []
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_logout_user_removes_only_the_current_session() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    password = "integration-password"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            registered = await register_user(
                session,
                email=email,
                password=password,
                display_name="Logout User",
            )
            persisted_user_id = registered.user.id
            user_id = persisted_user_id

        async with session_factory() as session:
            logged_in = await login_user(
                session,
                email=email,
                password=password,
            )

        async with session_factory() as session:
            await logout_user(
                session,
                session_token=registered.session_token,
            )

            remaining_sessions = (
                await session.scalars(
                    select(AuthSession).where(AuthSession.user_id == persisted_user_id)
                )
            ).all()

        assert len(remaining_sessions) == 1
        assert remaining_sessions[0].token_hash == hash_session_token(logged_in.session_token)

        async with session_factory() as session:
            await logout_user(
                session,
                session_token=registered.session_token,
            )
            await logout_user(
                session,
                session_token="unknown-session-token",
            )

            remaining_sessions = (
                await session.scalars(
                    select(AuthSession).where(AuthSession.user_id == persisted_user_id)
                )
            ).all()

        assert len(remaining_sessions) == 1
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_get_user_for_session_returns_active_user() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            issued = await register_user(
                session,
                email=email,
                password="integration-password",
                display_name="Current User",
            )
            persisted_user_id = issued.user.id
            user_id = persisted_user_id
            session_token = issued.session_token

        async with session_factory() as session:
            user = await get_user_for_session(
                session,
                session_token=session_token,
            )

        assert user.id == persisted_user_id
        assert user.email == email
        assert user.display_name == "Current User"
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_get_user_for_session_rejects_expired_session() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            issued = await register_user(
                session,
                email=email,
                password="integration-password",
                display_name="Expired User",
            )
            persisted_user_id = issued.user.id
            user_id = persisted_user_id
            session_token = issued.session_token
            session_token_hash = hash_session_token(session_token)

        async with session_factory() as session:
            auth_session = await session.scalar(
                select(AuthSession).where(AuthSession.token_hash == session_token_hash)
            )
            assert auth_session is not None
            auth_session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()

        async with session_factory() as session:
            with pytest.raises(InvalidSessionError):
                await get_user_for_session(
                    session,
                    session_token=session_token,
                )
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_get_user_for_session_rejects_logged_out_token() -> None:
    engine, session_factory = create_test_session_factory()
    email = f"auth-test-{uuid.uuid4().hex}@example.com"
    user_id: uuid.UUID | None = None

    try:
        async with session_factory() as session:
            issued = await register_user(
                session,
                email=email,
                password="integration-password",
                display_name="Logged Out User",
            )
            persisted_user_id = issued.user.id
            user_id = persisted_user_id
            session_token = issued.session_token

        async with session_factory() as session:
            await logout_user(session, session_token=session_token)

        async with session_factory() as session:
            with pytest.raises(InvalidSessionError):
                await get_user_for_session(
                    session,
                    session_token=session_token,
                )
    finally:
        if user_id is not None:
            async with session_factory() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.anyio
async def test_get_user_for_session_rejects_unknown_token() -> None:
    engine, session_factory = create_test_session_factory()

    try:
        async with session_factory() as session:
            with pytest.raises(InvalidSessionError):
                await get_user_for_session(
                    session,
                    session_token="unknown-session-token",
                )
    finally:
        await engine.dispose()
