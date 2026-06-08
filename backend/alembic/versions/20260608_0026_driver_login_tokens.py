"""driver login tokens for magic-link auth

Revision ID: 20260608_0026
Revises: 20260607_0025
Create Date: 2026-06-08 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260608_0026"
down_revision = "20260607_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_login_tokens",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("driver_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_driver_login_tokens_driver_id", "driver_login_tokens", ["driver_id"])
    op.create_index("ix_driver_login_tokens_user_id", "driver_login_tokens", ["user_id"])
    op.create_index("ix_driver_login_tokens_expires_at", "driver_login_tokens", ["expires_at"])
    op.create_index("ix_driver_login_tokens_token_hash", "driver_login_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_driver_login_tokens_token_hash", table_name="driver_login_tokens")
    op.drop_index("ix_driver_login_tokens_expires_at", table_name="driver_login_tokens")
    op.drop_index("ix_driver_login_tokens_user_id", table_name="driver_login_tokens")
    op.drop_index("ix_driver_login_tokens_driver_id", table_name="driver_login_tokens")
    op.drop_table("driver_login_tokens")
