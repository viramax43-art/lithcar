"""add color for map marks

Revision ID: 20260602_0022
Revises: 20260602_0021
Create Date: 2026-06-02 19:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260602_0022"
down_revision = "20260602_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "map_marks",
        sa.Column("color", sa.String(), nullable=False, server_default="#EF4444"),
    )


def downgrade() -> None:
    op.drop_column("map_marks", "color")
