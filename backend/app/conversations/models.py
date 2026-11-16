import datetime
import uuid
from typing import Literal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    processing_token: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        nullable=True,
    )

    processing_expires_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_user_id_updated_at_id", "user_id", "updated_at", "id"),
        CheckConstraint("btrim(title) <> ''", name="title_not_empty"),
        CheckConstraint(
            """
            (processing_token IS NULL AND processing_expires_at IS NULL)
            OR
            (processing_token IS NOT NULL AND processing_expires_at IS NOT NULL)
            """,
            name="processing_lease_pair",
        ),
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[Literal["user", "assistant"]] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        Index("ix_conversation_id_created_at_id", "conversation_id", "created_at", "id"),
        CheckConstraint("role in ('user', 'assistant')", name="role_valid"),
        CheckConstraint("btrim(content) <> ''", name="content_not_empty"),
    )
