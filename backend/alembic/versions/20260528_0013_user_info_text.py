"""add user info text to pricing settings

Revision ID: 20260528_0013
Revises: 20260528_0012
Create Date: 2026-05-28 06:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0013"
down_revision = "20260528_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pricing_settings",
        sa.Column("user_info_text", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("pricing_settings", "user_info_text")
