"""driver ride offers

Revision ID: 20260612_0031
Revises: 20260610_0030
Create Date: 2026-06-12 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260612_0031"
down_revision = "20260610_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_ride_offers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("driver_id", sa.String(), nullable=False),
        sa.Column("from_address", sa.String(), nullable=False),
        sa.Column("from_lat", sa.Float(), nullable=False),
        sa.Column("from_lng", sa.Float(), nullable=False),
        sa.Column("to_address", sa.String(), nullable=False),
        sa.Column("to_lat", sa.Float(), nullable=False),
        sa.Column("to_lng", sa.Float(), nullable=False),
        sa.Column("date_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_seats", sa.Integer(), nullable=False),
        sa.Column("seats_available", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("total_seats >= 1 AND total_seats <= 12", name="ck_driver_ride_offers_total_seats"),
        sa.CheckConstraint(
            "seats_available >= 0 AND seats_available <= total_seats",
            name="ck_driver_ride_offers_seats_available",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'full', 'cancelled', 'completed')",
            name="ck_driver_ride_offers_status",
        ),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_driver_ride_offers_driver_id", "driver_ride_offers", ["driver_id"])
    op.create_index("ix_driver_ride_offers_status", "driver_ride_offers", ["status"])
    op.create_index("ix_driver_ride_offers_date_time", "driver_ride_offers", ["date_time"])
    op.create_index("ix_driver_ride_offers_status_date", "driver_ride_offers", ["status", "date_time"])

    op.add_column("ride_requests", sa.Column("offer_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_ride_requests_offer_id",
        "ride_requests",
        "driver_ride_offers",
        ["offer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_ride_requests_offer_id", "ride_requests", ["offer_id"])


def downgrade() -> None:
    op.drop_index("ix_ride_requests_offer_id", table_name="ride_requests")
    op.drop_constraint("fk_ride_requests_offer_id", "ride_requests", type_="foreignkey")
    op.drop_column("ride_requests", "offer_id")

    op.drop_index("ix_driver_ride_offers_status_date", table_name="driver_ride_offers")
    op.drop_index("ix_driver_ride_offers_date_time", table_name="driver_ride_offers")
    op.drop_index("ix_driver_ride_offers_status", table_name="driver_ride_offers")
    op.drop_index("ix_driver_ride_offers_driver_id", table_name="driver_ride_offers")
    op.drop_table("driver_ride_offers")
