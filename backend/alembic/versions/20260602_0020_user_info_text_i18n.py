"""migrate user_info_text to user_info_text_i18n jsonb

Revision ID: 20260602_0020
Revises: 20260601_0019
Create Date: 2026-06-02 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260602_0020"
down_revision = "20260601_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("pricing_settings")}

    if "user_info_text_i18n" not in columns:
        op.add_column(
            "pricing_settings",
            sa.Column("user_info_text_i18n", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        )

    columns = {column["name"] for column in inspector.get_columns("pricing_settings")}
    if "user_info_text" in columns:
        op.execute(
            """
            UPDATE pricing_settings
            SET user_info_text_i18n = jsonb_build_object('lt', user_info_text)
            WHERE coalesce(user_info_text, '') <> ''
              AND (user_info_text_i18n IS NULL OR user_info_text_i18n = '{}'::jsonb)
            """
        )
        op.drop_column("pricing_settings", "user_info_text")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("pricing_settings")}

    if "user_info_text" not in columns:
        op.add_column(
            "pricing_settings",
            sa.Column("user_info_text", sa.Text(), nullable=False, server_default=""),
        )

    if "user_info_text_i18n" in columns:
        op.execute(
            """
            UPDATE pricing_settings
            SET user_info_text = coalesce(user_info_text_i18n->>'lt', '')
            WHERE user_info_text_i18n IS NOT NULL
            """
        )
        op.drop_column("pricing_settings", "user_info_text_i18n")
