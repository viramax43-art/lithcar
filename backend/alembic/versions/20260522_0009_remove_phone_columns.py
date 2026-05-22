"""remove phone columns

Revision ID: 20260522_0009
Revises: 20260522_0008
Create Date: 2026-05-22 16:47:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260522_0009"
down_revision = "20260522_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("ride_requests", "passenger_phone")
    op.drop_column("drivers", "phone")


def downgrade() -> None:
    op.add_column("drivers", sa.Column("phone", sa.String(), nullable=True, server_default=""))
    op.add_column(
        "ride_requests",
        sa.Column("passenger_phone", sa.String(), nullable=True, server_default=""),
    )
