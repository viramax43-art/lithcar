"""user points and cabinet support

Revision ID: 20260513_0003
Revises: 20260513_0002
Create Date: 2026-05-13 00:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260513_0003"
down_revision = "20260513_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("points_balance", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "points_transactions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("transaction_type", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_points_transactions_user_id", "points_transactions", ["user_id"])
    op.create_index("ix_points_transactions_transaction_type", "points_transactions", ["transaction_type"])
    op.create_index("ix_points_transactions_created_at", "points_transactions", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_points_transactions_created_at", table_name="points_transactions")
    op.drop_index("ix_points_transactions_transaction_type", table_name="points_transactions")
    op.drop_index("ix_points_transactions_user_id", table_name="points_transactions")
    op.drop_table("points_transactions")
    op.drop_column("users", "points_balance")
