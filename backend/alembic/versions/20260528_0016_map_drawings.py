"""add map drawings table for admin annotations

Revision ID: 20260528_0016
Revises: 20260528_0015
Create Date: 2026-05-28 08:55:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260528_0016"
down_revision = "20260528_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "map_drawings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False, server_default="#DC2626"),
        sa.Column("stroke_width", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("points", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by_role", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_map_drawings_created_at"), "map_drawings", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_map_drawings_created_at"), table_name="map_drawings")
    op.drop_table("map_drawings")
