"""Add pickup_revision counter for pickup confirmation flow

Revision ID: 20260918_0036
Revises: 20260918_0035
Create Date: 2026-09-18 14:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260918_0036"
down_revision = "20260918_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("pickup_revision", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "pickup_revision")
