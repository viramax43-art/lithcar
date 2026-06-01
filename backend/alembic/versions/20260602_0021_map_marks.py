"""add map marks table for admin labels

Revision ID: 20260602_0021
Revises: 20260602_0020
Create Date: 2026-06-02 19:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260602_0021"
down_revision = "20260602_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "map_marks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("visibility", sa.String(), nullable=False, server_default="admin_only"),
        sa.Column("photo_key", sa.String(), nullable=True),
        sa.Column("created_by_role", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_map_marks_created_at"), "map_marks", ["created_at"], unique=False)
    op.create_index(op.f("ix_map_marks_visibility"), "map_marks", ["visibility"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_map_marks_visibility"), table_name="map_marks")
    op.drop_index(op.f("ix_map_marks_created_at"), table_name="map_marks")
    op.drop_table("map_marks")
