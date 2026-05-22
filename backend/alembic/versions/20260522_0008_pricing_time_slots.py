"""add work hours and slot interval to pricing_settings

Revision ID: 20260522_0008
Revises: 20260522_0007
Create Date: 2026-05-22 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260522_0008"
down_revision = "20260522_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pricing_settings",
        sa.Column("work_start_time", sa.String(), nullable=False, server_default="06:00"),
    )
    op.add_column(
        "pricing_settings",
        sa.Column("work_end_time", sa.String(), nullable=False, server_default="19:00"),
    )
    op.add_column(
        "pricing_settings",
        sa.Column("slot_interval_minutes", sa.Integer(), nullable=False, server_default="30"),
    )


def downgrade() -> None:
    op.drop_column("pricing_settings", "slot_interval_minutes")
    op.drop_column("pricing_settings", "work_end_time")
    op.drop_column("pricing_settings", "work_start_time")
