"""service zone long-route direction fields

Revision ID: 20260927_0041
Revises: 20260925_0040
Create Date: 2026-09-27 22:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260927_0041"
down_revision = "20260925_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("service_zones", sa.Column("direction_from", sa.String(), nullable=True))
    op.add_column("service_zones", sa.Column("direction_to", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("service_zones", "direction_to")
    op.drop_column("service_zones", "direction_from")
