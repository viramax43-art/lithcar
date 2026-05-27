"""add route_order column to ride_requests

Revision ID: 20260528_0011
Revises: 20260522_0010
Create Date: 2026-05-28 02:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0011"
down_revision = "20260522_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("route_order", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "route_order")
