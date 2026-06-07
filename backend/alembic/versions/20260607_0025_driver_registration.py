"""driver registration settings and applications

Revision ID: 20260607_0025
Revises: 20260603_0024
Create Date: 2026-06-07 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260607_0025"
down_revision = "20260603_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_registration_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("form_schema_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute(
        """
        INSERT INTO driver_registration_settings (id, form_schema_json)
        VALUES (1, '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
        """
    )

    op.create_table(
        "driver_applications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("language", sa.String(length=8), nullable=False, server_default="lt"),
        sa.Column("answers_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("files_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("rejection_reason", sa.String(), nullable=True),
        sa.Column("reviewed_by", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_driver_id", sa.String(), sa.ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_driver_applications_user_id", "driver_applications", ["user_id"])
    op.create_index("ix_driver_applications_status", "driver_applications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_driver_applications_status", table_name="driver_applications")
    op.drop_index("ix_driver_applications_user_id", table_name="driver_applications")
    op.drop_table("driver_applications")
    op.drop_table("driver_registration_settings")
