"""Add payment_method to ride_requests

Revision ID: 20260919_0037
Revises: 20260918_0036
Create Date: 2026-09-19 11:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260919_0037"
down_revision = "20260918_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("payment_method", sa.String(), nullable=False, server_default="points"),
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "payment_method")
