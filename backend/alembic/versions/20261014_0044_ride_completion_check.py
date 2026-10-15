"""ride completion check ("did the ride happen?")

Revision ID: 20261014_0044
Revises: 20261014_0043
Create Date: 2026-10-14
"""

from alembic import op
import sqlalchemy as sa

revision = "20261014_0044"
down_revision = "20261014_0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Водитель начал поездку и не нажал «Завершил»: спрашиваем пассажира «Поездка состоялась?».
    op.add_column("ride_requests", sa.Column("completion_check_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("completion_check_result", sa.String(), nullable=True))
    op.add_column(
        "ride_requests",
        sa.Column("completion_check_answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "ride_requests",
        sa.Column("completion_check_reminded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "ride_requests",
        sa.Column("completion_check_escalated_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Сторож выбирает активные поездки по времени начала — индекс ускоряет обход.
    op.create_index(
        "ix_ride_requests_started_at",
        "ride_requests",
        ["started_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ride_requests_started_at", table_name="ride_requests")
    op.drop_column("ride_requests", "completion_check_escalated_at")
    op.drop_column("ride_requests", "completion_check_reminded_at")
    op.drop_column("ride_requests", "completion_check_answered_at")
    op.drop_column("ride_requests", "completion_check_result")
    op.drop_column("ride_requests", "completion_check_at")
