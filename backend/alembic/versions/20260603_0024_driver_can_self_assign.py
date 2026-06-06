"""driver can self assign rides

Revision ID: 20260603_0024
Revises: 20260602_0023
Create Date: 2026-06-03 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260603_0024"
down_revision = "20260602_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "drivers",
        sa.Column("can_self_assign", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("drivers", "can_self_assign")
