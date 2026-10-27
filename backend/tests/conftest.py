import os

import pytest
from sqlalchemy.engine import make_url

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg_async://travel:travel@localhost:5432/travel_test",
)

# Test modules import Settings during collection, so switch databases before that happens.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["APP_ENV"] = "test"


def pytest_sessionstart(session) -> None:
    from app.core.config import settings

    database_name = make_url(settings.database_url).database
    if database_name != "travel_test":
        raise pytest.UsageError(
            f"Tests must use the isolated travel_test database, not {database_name!r}."
        )


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
