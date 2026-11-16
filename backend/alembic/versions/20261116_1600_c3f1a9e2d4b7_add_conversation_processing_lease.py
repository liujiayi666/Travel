"""add conversation processing lease

Revision ID: c3f1a9e2d4b7
Revises: 8f3c2a1b7d90
Create Date: 2026-11-16 16:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f1a9e2d4b7"
down_revision: str | Sequence[str] | None = "8f3c2a1b7d90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the per-conversation processing lease."""
    op.add_column(
        "conversations",
        sa.Column("processing_token", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("processing_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_conversations_processing_lease_pair"),
        "conversations",
        """
        (processing_token IS NULL AND processing_expires_at IS NULL)
        OR
        (processing_token IS NOT NULL AND processing_expires_at IS NOT NULL)
        """,
    )


def downgrade() -> None:
    """Remove the per-conversation processing lease."""
    op.drop_constraint(
        op.f("ck_conversations_processing_lease_pair"),
        "conversations",
        type_="check",
    )
    op.drop_column("conversations", "processing_expires_at")
    op.drop_column("conversations", "processing_token")
