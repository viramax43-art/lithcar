"""qr points sales and audit events

Revision ID: 20260517_0006
Revises: 20260513_0005
Create Date: 2026-05-17 19:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260517_0006"
down_revision = "20260513_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "drivers",
        sa.Column("can_sell_points", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.add_column("points_transactions", sa.Column("reference_id", sa.String(), nullable=True))
    op.add_column("points_transactions", sa.Column("eur_amount_cents", sa.Integer(), nullable=True))
    op.create_index("ix_points_transactions_reference_id", "points_transactions", ["reference_id"])

    op.create_table(
        "driver_qr_sales",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("driver_id", sa.String(), nullable=False),
        sa.Column("token", sa.String(length=120), nullable=False),
        sa.Column("points_amount", sa.Integer(), nullable=False),
        sa.Column("eur_amount_cents", sa.Integer(), nullable=False),
        sa.Column(
            "cash_settlement_status",
            sa.String(),
            nullable=False,
            server_default="owed_to_driver",
        ),
        sa.Column("redeemed_by_user_id", sa.String(), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["redeemed_by_user_id"], ["users.user_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_driver_qr_sales_driver_id", "driver_qr_sales", ["driver_id"])
    op.create_index("ix_driver_qr_sales_token", "driver_qr_sales", ["token"], unique=True)
    op.create_index("ix_driver_qr_sales_cash_settlement_status", "driver_qr_sales", ["cash_settlement_status"])
    op.create_index("ix_driver_qr_sales_redeemed_by_user_id", "driver_qr_sales", ["redeemed_by_user_id"])
    op.create_index("ix_driver_qr_sales_redeemed_at", "driver_qr_sales", ["redeemed_at"])
    op.create_index("ix_driver_qr_sales_created_at", "driver_qr_sales", ["created_at"])

    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("actor_type", sa.String(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_events_actor_type", "admin_audit_events", ["actor_type"])
    op.create_index("ix_admin_audit_events_actor_id", "admin_audit_events", ["actor_id"])
    op.create_index("ix_admin_audit_events_action", "admin_audit_events", ["action"])
    op.create_index("ix_admin_audit_events_resource_type", "admin_audit_events", ["resource_type"])
    op.create_index("ix_admin_audit_events_resource_id", "admin_audit_events", ["resource_id"])
    op.create_index("ix_admin_audit_events_created_at", "admin_audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_admin_audit_events_created_at", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_resource_id", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_resource_type", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_action", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_actor_id", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_actor_type", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")

    op.drop_index("ix_driver_qr_sales_created_at", table_name="driver_qr_sales")
    op.drop_index("ix_driver_qr_sales_redeemed_at", table_name="driver_qr_sales")
    op.drop_index("ix_driver_qr_sales_redeemed_by_user_id", table_name="driver_qr_sales")
    op.drop_index("ix_driver_qr_sales_cash_settlement_status", table_name="driver_qr_sales")
    op.drop_index("ix_driver_qr_sales_token", table_name="driver_qr_sales")
    op.drop_index("ix_driver_qr_sales_driver_id", table_name="driver_qr_sales")
    op.drop_table("driver_qr_sales")

    op.drop_index("ix_points_transactions_reference_id", table_name="points_transactions")
    op.drop_column("points_transactions", "eur_amount_cents")
    op.drop_column("points_transactions", "reference_id")

    op.drop_column("drivers", "can_sell_points")
