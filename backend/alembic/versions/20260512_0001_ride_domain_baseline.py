"""ride domain baseline

Revision ID: 20260512_0001
Revises:
Create Date: 2026-05-12 23:50:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260512_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False, server_default="passenger"),
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "drivers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("car_model", sa.String(), nullable=False),
        sa.Column("car_plate", sa.String(), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("current_lat", sa.Float(), nullable=True),
        sa.Column("current_lng", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "pricing_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("points_per_ride", sa.Integer(), nullable=False),
        sa.Column("point_price_cents", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "service_zones",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("polygon", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "ride_requests",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("passenger_id", sa.String(), nullable=False),
        sa.Column("passenger_name", sa.String(), nullable=False),
        sa.Column("passenger_phone", sa.String(), nullable=False),
        sa.Column("from_address", sa.String(), nullable=False),
        sa.Column("from_lat", sa.Float(), nullable=False),
        sa.Column("from_lng", sa.Float(), nullable=False),
        sa.Column("to_address", sa.String(), nullable=False),
        sa.Column("to_lat", sa.Float(), nullable=False),
        sa.Column("to_lng", sa.Float(), nullable=False),
        sa.Column("date_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("group_id", sa.String(), nullable=True),
        sa.Column("driver_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["passenger_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ride_requests_passenger_id", "ride_requests", ["passenger_id"])
    op.create_index("ix_ride_requests_status", "ride_requests", ["status"])
    op.create_index("ix_ride_requests_group_id", "ride_requests", ["group_id"])
    op.create_index("ix_ride_requests_driver_id", "ride_requests", ["driver_id"])
    op.create_index("ix_ride_requests_date_time", "ride_requests", ["date_time"])
    op.create_index("ix_ride_requests_created_at", "ride_requests", ["created_at"])

    op.execute(
        sa.text(
            "INSERT INTO pricing_settings (id, points_per_ride, point_price_cents) VALUES (1, 10, 50)"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_ride_requests_created_at", table_name="ride_requests")
    op.drop_index("ix_ride_requests_date_time", table_name="ride_requests")
    op.drop_index("ix_ride_requests_driver_id", table_name="ride_requests")
    op.drop_index("ix_ride_requests_group_id", table_name="ride_requests")
    op.drop_index("ix_ride_requests_status", table_name="ride_requests")
    op.drop_index("ix_ride_requests_passenger_id", table_name="ride_requests")
    op.drop_table("ride_requests")
    op.drop_table("service_zones")
    op.drop_table("pricing_settings")
    op.drop_table("drivers")
    op.drop_table("users")
