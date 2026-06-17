"""user blocks

Revision ID: 20260617_0033
Revises: 20260612_0032
Create Date: 2026-06-17 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260617_0033"
down_revision = "20260612_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_blocks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "blocker_user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "blocked_user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_blocks_pair"),
        sa.CheckConstraint("blocker_user_id != blocked_user_id", name="ck_user_blocks_no_self"),
    )
    op.create_index("ix_user_blocks_blocker_user_id", "user_blocks", ["blocker_user_id"])
    op.create_index("ix_user_blocks_blocked_user_id", "user_blocks", ["blocked_user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_blocks_blocked_user_id", table_name="user_blocks")
    op.drop_index("ix_user_blocks_blocker_user_id", table_name="user_blocks")
    op.drop_table("user_blocks")
