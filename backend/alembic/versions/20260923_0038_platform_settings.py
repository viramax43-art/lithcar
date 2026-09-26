"""platform_settings singleton table

Revision ID: 20260923_0038
Revises: 20260919_0037
Create Date: 2026-09-23 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260923_0038"
down_revision = "20260919_0037"
branch_labels = None
depends_on = None

DEFAULT_CONFIG = {
    "passenger": {"defaultPointsBalance": 100},
    "driver": {},
    "system": {},
    "promotions": {},
}


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("config_json", JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.execute(
        sa.text(
            "INSERT INTO platform_settings (id, config_json) "
            "VALUES (1, CAST(:cfg AS jsonb))"
        ).bindparams(cfg='{"passenger":{"defaultPointsBalance": 100}}'),
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
