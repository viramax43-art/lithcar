"""notifications inbox table

Revision ID: 20260608_0027
Revises: 20260608_0026
Create Date: 2026-06-08 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260608_0027"
down_revision = "20260608_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("pool", sa.String(), nullable=False),
        sa.Column("recipient_type", sa.String(), nullable=False),
        sa.Column("recipient_id", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_admin_key_id", sa.String(), nullable=True),
        sa.Column("send_telegram", sa.Boolean(), server_default="false", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notifications_recipient_created",
        "notifications",
        ["pool", "recipient_type", "recipient_id", "created_at"],
    )
    op.create_index(
        "ix_notifications_recipient_read",
        "notifications",
        ["pool", "recipient_type", "recipient_id", "read_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_read", table_name="notifications")
    op.drop_index("ix_notifications_recipient_created", table_name="notifications")
    op.drop_table("notifications")
