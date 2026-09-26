"""allow clearing passenger number during driver unassignment

Revision ID: 20260925_0040
Revises: 20260924_0039
Create Date: 2026-09-25 12:00:00.000000
"""

from alembic import op


revision = "20260925_0040"
down_revision = "20260924_0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_passenger_number_change()
        RETURNS trigger AS $$
        BEGIN
            IF OLD.passenger_number IS NOT NULL
               AND NEW.passenger_number IS DISTINCT FROM OLD.passenger_number
               AND NOT (
                   NEW.passenger_number IS NULL
                   AND NEW.driver_id IS NULL
                   AND NEW.status IN ('pending', 'grouped')
               ) THEN
                RAISE EXCEPTION 'passenger_number is immutable once assigned';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )


def downgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_passenger_number_change()
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
