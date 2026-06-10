"""info block title and body i18n

Revision ID: 20260610_0030
Revises: 20260610_0029
Create Date: 2026-06-10 20:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260610_0030"
down_revision = "20260610_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "info_blocks",
        sa.Column("title_i18n", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column(
        "info_blocks",
        sa.Column("body_i18n", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )

    op.execute(
        """
        UPDATE info_blocks
        SET
            title_i18n = jsonb_build_object('lt', title),
            body_i18n = jsonb_build_object('lt', body)
        WHERE coalesce(title, '') <> '' OR coalesce(body, '') <> ''
        """
    )

    op.drop_column("info_blocks", "title")
    op.drop_column("info_blocks", "body")


def downgrade() -> None:
    op.add_column("info_blocks", sa.Column("title", sa.String(), nullable=False, server_default=""))
    op.add_column("info_blocks", sa.Column("body", sa.String(), nullable=False, server_default=""))

    op.execute(
        """
        UPDATE info_blocks
        SET
            title = coalesce(title_i18n->>'lt', ''),
            body = coalesce(body_i18n->>'lt', '')
        """
    )

    op.alter_column("info_blocks", "title", server_default=None)
    op.alter_column("info_blocks", "body", server_default=None)
    op.drop_column("info_blocks", "body_i18n")
    op.drop_column("info_blocks", "title_i18n")
