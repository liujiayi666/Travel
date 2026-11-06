"""widen message content

Revision ID: 8f3c2a1b7d90
Revises: 7729534e9371
Create Date: 2026-11-05 13:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8f3c2a1b7d90"
down_revision: str | Sequence[str] | None = "7729534e9371"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Allow model responses longer than the user-input limit."""
    op.alter_column(
        "messages",
        "content",
        existing_type=sa.String(length=4000),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Restore the previous varchar limit with an explicit lossy truncation."""
    # Narrowing text to varchar cannot preserve content longer than 4000 characters.
    # Truncate explicitly so rollback is deterministic instead of failing mid-migration.
    op.execute(
        sa.text(
            "UPDATE messages SET content = left(content, 4000) WHERE char_length(content) > 4000"
        )
    )
    op.alter_column(
        "messages",
        "content",
        existing_type=sa.Text(),
        type_=sa.String(length=4000),
        existing_nullable=False,
    )
