"""driver online heartbeat timestamp

Revision ID: 20260513_0005
Revises: 20260513_0004
Create Date: 2026-05-13 18:25:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260513_0005"
down_revision = "20260513_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drivers", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("drivers", "last_seen_at")
