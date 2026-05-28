"""ride ratings and user rating aggregate

Revision ID: 20260528_0018
Revises: 20260528_0017
Create Date: 2026-05-28 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0018"
down_revision = "20260528_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("rating", sa.Float(), nullable=False, server_default="5.0"),
    )

    op.create_table(
        "ride_ratings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "ride_request_id",
            sa.String(),
            sa.ForeignKey("ride_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rater_role", sa.String(), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ride_request_id", "rater_role", name="uq_ride_ratings_ride_rater"),
        sa.CheckConstraint("score >= 1 AND score <= 5", name="ck_ride_ratings_score_range"),
    )
    op.create_index("ix_ride_ratings_ride_request_id", "ride_ratings", ["ride_request_id"])


def downgrade() -> None:
    op.drop_index("ix_ride_ratings_ride_request_id", table_name="ride_ratings")
    op.drop_table("ride_ratings")
    op.drop_column("users", "rating")
