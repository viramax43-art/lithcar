"""remove driver offer total_seats upper limit

Revision ID: 20260612_0032
Revises: 20260612_0031
Create Date: 2026-06-12 18:00:00.000000
"""

from alembic import op


revision = "20260612_0032"
down_revision = "20260612_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_driver_ride_offers_total_seats", "driver_ride_offers", type_="check")
    op.create_check_constraint(
        "ck_driver_ride_offers_total_seats",
        "driver_ride_offers",
        "total_seats >= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_driver_ride_offers_total_seats", "driver_ride_offers", type_="check")
    op.create_check_constraint(
        "ck_driver_ride_offers_total_seats",
        "driver_ride_offers",
        "total_seats >= 1 AND total_seats <= 12",
    )
