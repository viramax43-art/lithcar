"""driver profile fields and cabinet support

Revision ID: 20260513_0004
Revises: 20260513_0003
Create Date: 2026-05-13 16:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260513_0004"
down_revision = "20260513_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drivers", sa.Column("photo_url", sa.String(), nullable=True))
    op.add_column(
        "drivers",
        sa.Column("car_brand", sa.String(), nullable=False, server_default="Unknown"),
    )
    op.add_column(
        "drivers",
        sa.Column("vehicle_color", sa.String(), nullable=False, server_default="Unknown"),
    )
    op.add_column(
        "drivers",
        sa.Column("seats_count", sa.Integer(), nullable=False, server_default="4"),
    )
    op.add_column(
        "drivers",
        sa.Column("license_number", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "drivers",
        sa.Column("about", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "drivers",
        sa.Column("access_key_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "drivers",
        sa.Column("key_prefix", sa.String(), nullable=True),
    )
    op.create_index("ix_drivers_access_key_hash", "drivers", ["access_key_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_drivers_access_key_hash", table_name="drivers")
    op.drop_column("drivers", "key_prefix")
    op.drop_column("drivers", "access_key_hash")
    op.drop_column("drivers", "about")
    op.drop_column("drivers", "license_number")
    op.drop_column("drivers", "seats_count")
    op.drop_column("drivers", "vehicle_color")
    op.drop_column("drivers", "car_brand")
    op.drop_column("drivers", "photo_url")
