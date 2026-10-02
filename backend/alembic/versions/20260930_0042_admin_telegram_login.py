"""admin telegram login binding

Revision ID: 20260930_0042
Revises: 20260927_0041
Create Date: 2026-09-30 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260930_0042"
down_revision = "20260927_0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_api_keys", sa.Column("telegram_username", sa.String(), nullable=True))
    op.add_column("admin_api_keys", sa.Column("telegram_user_id", sa.String(), nullable=True))
    op.create_index(
        "ix_admin_api_keys_telegram_username",
        "admin_api_keys",
        ["telegram_username"],
        unique=False,
    )
    op.create_index(
        "ix_admin_api_keys_telegram_user_id",
        "admin_api_keys",
        ["telegram_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_admin_api_keys_telegram_user_id", table_name="admin_api_keys")
    op.drop_index("ix_admin_api_keys_telegram_username", table_name="admin_api_keys")
    op.drop_column("admin_api_keys", "telegram_user_id")
    op.drop_column("admin_api_keys", "telegram_username")
