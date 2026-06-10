"""info block audience targeting by username

Revision ID: 20260610_0029
Revises: 20260610_0028
Create Date: 2026-06-10 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260610_0029"
down_revision = "20260610_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "info_blocks",
        sa.Column("audience", sa.String(), server_default="all", nullable=False),
    )
    op.add_column("info_blocks", sa.Column("target_username", sa.String(), nullable=True))
    op.add_column("info_blocks", sa.Column("target_user_id", sa.String(), nullable=True))
    op.add_column("info_blocks", sa.Column("target_driver_id", sa.String(), nullable=True))
    op.create_index("ix_info_blocks_target_user_id", "info_blocks", ["target_user_id"])
    op.create_index("ix_info_blocks_target_driver_id", "info_blocks", ["target_driver_id"])


def downgrade() -> None:
    op.drop_index("ix_info_blocks_target_driver_id", table_name="info_blocks")
    op.drop_index("ix_info_blocks_target_user_id", table_name="info_blocks")
    op.drop_column("info_blocks", "target_driver_id")
    op.drop_column("info_blocks", "target_user_id")
    op.drop_column("info_blocks", "target_username")
    op.drop_column("info_blocks", "audience")
