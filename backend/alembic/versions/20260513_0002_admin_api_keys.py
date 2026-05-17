"""admin api keys

Revision ID: 20260513_0002
Revises: 20260512_0001
Create Date: 2026-05-13 00:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260513_0002"
down_revision = "20260512_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_api_keys",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False),
        sa.Column("key_prefix", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by_key_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_key_id"], ["admin_api_keys.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_api_keys_role", "admin_api_keys", ["role"])
    op.create_index("ix_admin_api_keys_key_hash", "admin_api_keys", ["key_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_admin_api_keys_key_hash", table_name="admin_api_keys")
    op.drop_index("ix_admin_api_keys_role", table_name="admin_api_keys")
    op.drop_table("admin_api_keys")
