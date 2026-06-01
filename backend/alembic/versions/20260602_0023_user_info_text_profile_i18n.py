"""add profile user info i18n text for pricing settings

Revision ID: 20260602_0023
Revises: 20260602_0022
Create Date: 2026-06-02 23:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260602_0023"
down_revision = "20260602_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("pricing_settings")}

    if "user_info_text_profile_i18n" not in columns:
        op.add_column(
            "pricing_settings",
            sa.Column("user_info_text_profile_i18n", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("pricing_settings")}
    if "user_info_text_profile_i18n" in columns:
        op.drop_column("pricing_settings", "user_info_text_profile_i18n")
