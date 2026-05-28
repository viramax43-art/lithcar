"""store original pickup point for driver reset

Revision ID: 20260528_0014
Revises: 20260528_0013
Create Date: 2026-05-28 08:50:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0014"
down_revision = "20260528_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ride_requests", sa.Column("original_from_address", sa.String(), nullable=True))
    op.add_column("ride_requests", sa.Column("original_from_lat", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("original_from_lng", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("ride_requests", "original_from_lng")
    op.drop_column("ride_requests", "original_from_lat")
    op.drop_column("ride_requests", "original_from_address")
