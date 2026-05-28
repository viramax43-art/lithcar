"""add unique numeric ride number

Revision ID: 20260528_0012
Revises: 20260528_0011
Create Date: 2026-05-28 05:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0012"
down_revision = "20260528_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS ride_requests_ride_number_seq START WITH 1 INCREMENT BY 1"))
    op.add_column(
        "ride_requests",
        sa.Column(
            "ride_number",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("nextval('ride_requests_ride_number_seq')"),
        ),
    )
    op.create_index(
        "ix_ride_requests_ride_number",
        "ride_requests",
        ["ride_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_ride_requests_ride_number", table_name="ride_requests")
    op.drop_column("ride_requests", "ride_number")
    op.execute(sa.text("DROP SEQUENCE IF EXISTS ride_requests_ride_number_seq"))
