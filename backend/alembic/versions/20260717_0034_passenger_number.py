"""replace mutable route order with stable passenger number

Revision ID: 20260717_0034
Revises: 20260617_0033
Create Date: 2026-07-17 01:50:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260717_0034"
down_revision = "20260617_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("passenger_number", sa.Integer(), nullable=True),
    )
    op.execute(
        sa.text(
            """
            WITH ranked_active AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY driver_id
                        ORDER BY route_order NULLS LAST, created_at, id
                    ) AS passenger_number
                FROM ride_requests
                WHERE driver_id IS NOT NULL
                  AND status <> 'completed'
            )
            UPDATE ride_requests AS rides
            SET passenger_number = ranked_active.passenger_number
            FROM ranked_active
            WHERE rides.id = ranked_active.id
            """
        )
    )
    op.create_check_constraint(
        "ck_ride_requests_passenger_number_positive",
        "ride_requests",
        "passenger_number IS NULL OR passenger_number > 0",
    )
    op.create_check_constraint(
        "ck_ride_requests_passenger_number_has_driver",
        "ride_requests",
        "passenger_number IS NULL OR driver_id IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_ride_requests_active_driver_has_passenger_number",
        "ride_requests",
        "status = 'completed' OR driver_id IS NULL OR passenger_number IS NOT NULL",
    )
    op.create_index(
        "uq_ride_requests_driver_passenger_number",
        "ride_requests",
        ["driver_id", "passenger_number"],
        unique=True,
        postgresql_where=sa.text(
            "driver_id IS NOT NULL AND passenger_number IS NOT NULL"
        ),
    )
    op.execute(
        """
        CREATE FUNCTION prevent_passenger_number_change()
        RETURNS trigger AS $$
        BEGIN
            IF OLD.passenger_number IS NOT NULL
               AND NEW.passenger_number IS DISTINCT FROM OLD.passenger_number THEN
                RAISE EXCEPTION 'passenger_number is immutable once assigned';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_ride_requests_passenger_number_immutable
        BEFORE UPDATE OF passenger_number ON ride_requests
        FOR EACH ROW
        EXECUTE FUNCTION prevent_passenger_number_change()
        """
    )
    op.drop_column("ride_requests", "route_order")


def downgrade() -> None:
    op.add_column(
        "ride_requests",
        sa.Column("route_order", sa.Integer(), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE ride_requests
            SET route_order = passenger_number
            WHERE passenger_number IS NOT NULL
            """
        )
    )
    op.execute(
        "DROP TRIGGER trg_ride_requests_passenger_number_immutable ON ride_requests"
    )
    op.execute("DROP FUNCTION prevent_passenger_number_change()")
    op.drop_index(
        "uq_ride_requests_driver_passenger_number",
        table_name="ride_requests",
    )
    op.drop_constraint(
        "ck_ride_requests_active_driver_has_passenger_number",
        "ride_requests",
        type_="check",
    )
    op.drop_constraint(
        "ck_ride_requests_passenger_number_has_driver",
        "ride_requests",
        type_="check",
    )
    op.drop_constraint(
        "ck_ride_requests_passenger_number_positive",
        "ride_requests",
        type_="check",
    )
    op.drop_column("ride_requests", "passenger_number")
