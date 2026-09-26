"""passenger live location on ride requests

Revision ID: 20260924_0039
Revises: 20260923_0038
Create Date: 2026-09-24
"""

from alembic import op
import sqlalchemy as sa

revision = "20260924_0039"
down_revision = "20260923_0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ride_requests", sa.Column("passenger_live_lat", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("passenger_live_lng", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("passenger_live_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("ride_requests", "passenger_live_at")
    op.drop_column("ride_requests", "passenger_live_lng")
    op.drop_column("ride_requests", "passenger_live_lat")
