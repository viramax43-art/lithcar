"""info blocks for passenger and driver notification pools

Revision ID: 20260610_0028
Revises: 20260608_0027
Create Date: 2026-06-10 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260610_0028"
down_revision = "20260608_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "info_blocks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("pool", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by_admin_key_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_info_blocks_pool", "info_blocks", ["pool"])

    op.create_table(
        "info_block_reads",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("info_block_id", sa.String(), nullable=False),
        sa.Column("recipient_type", sa.String(), nullable=False),
        sa.Column("recipient_id", sa.String(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["info_block_id"], ["info_blocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "info_block_id",
            "recipient_type",
            "recipient_id",
            name="uq_info_block_reads_recipient",
        ),
    )
    op.create_index("ix_info_block_reads_info_block_id", "info_block_reads", ["info_block_id"])
    op.create_index("ix_info_block_reads_recipient_id", "info_block_reads", ["recipient_id"])


def downgrade() -> None:
    op.drop_index("ix_info_block_reads_recipient_id", table_name="info_block_reads")
    op.drop_index("ix_info_block_reads_info_block_id", table_name="info_block_reads")
    op.drop_table("info_block_reads")
    op.drop_index("ix_info_blocks_pool", table_name="info_blocks")
    op.drop_table("info_blocks")
