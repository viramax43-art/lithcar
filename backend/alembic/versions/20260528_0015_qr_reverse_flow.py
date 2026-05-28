"""extend driver_qr_sales for passenger-issued qr flow

Revision ID: 20260528_0015
Revises: 20260528_0014
Create Date: 2026-05-28 09:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0015"
down_revision = "20260528_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("driver_qr_sales") as batch_op:
        batch_op.alter_column("driver_id", existing_type=sa.String(), nullable=True)
        batch_op.add_column(sa.Column("issuer_user_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("redeemed_by_driver_id", sa.String(), nullable=True))
        batch_op.create_index(batch_op.f("ix_driver_qr_sales_issuer_user_id"), ["issuer_user_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_driver_qr_sales_redeemed_by_driver_id"),
            ["redeemed_by_driver_id"],
            unique=False,
        )
        batch_op.create_foreign_key(
            "fk_driver_qr_sales_issuer_user_id_users",
            "users",
            ["issuer_user_id"],
            ["user_id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            "fk_driver_qr_sales_redeemed_by_driver_id_drivers",
            "drivers",
            ["redeemed_by_driver_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("driver_qr_sales") as batch_op:
        batch_op.drop_constraint("fk_driver_qr_sales_redeemed_by_driver_id_drivers", type_="foreignkey")
        batch_op.drop_constraint("fk_driver_qr_sales_issuer_user_id_users", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_driver_qr_sales_redeemed_by_driver_id"))
        batch_op.drop_index(batch_op.f("ix_driver_qr_sales_issuer_user_id"))
        batch_op.drop_column("redeemed_by_driver_id")
        batch_op.drop_column("issuer_user_id")
        batch_op.alter_column("driver_id", existing_type=sa.String(), nullable=False)
