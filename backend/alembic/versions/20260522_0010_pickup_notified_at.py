"""add pickup_notified_at column

Revision ID: 20260522_0010
Revises: 20260522_0009
Create Date: 2026-05-22 17:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260522_0010"
down_revision = "20260522_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("pickup_notified_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "pickup_notified_at")
