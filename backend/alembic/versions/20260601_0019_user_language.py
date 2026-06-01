"""add users.language

Revision ID: 20260601_0019
Revises: 20260528_0018
Create Date: 2026-06-01 18:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260601_0019"
down_revision = "20260528_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "language" in columns:
        return
    op.add_column(
        "users",
        sa.Column("language", sa.String(length=8), nullable=False, server_default="lt"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "language" not in columns:
        return
    op.drop_column("users", "language")
