"""pickup confirmation fields

Revision ID: 20260522_0007
Revises: 20260517_0006
Create Date: 2026-05-22 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260522_0007"
down_revision = "20260517_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("pickup_changed_by_driver", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "ride_requests",
        sa.Column("pickup_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "pickup_confirmed_at")
    op.drop_column("ride_requests", "pickup_changed_by_driver")
