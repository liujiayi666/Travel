from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)


def check_database() -> str:
    """Ping the database. Returns 'connected' or 'unreachable' — never raises."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return "unreachable"
    return "connected"
