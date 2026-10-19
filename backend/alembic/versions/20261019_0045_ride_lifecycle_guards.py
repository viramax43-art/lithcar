"""ride lifecycle guards, waiting limits and cancellation settlement

Revision ID: 20261019_0045
Revises: 20261014_0044
Create Date: 2026-10-19
"""

from alembic import op
import sqlalchemy as sa

revision = "20261019_0045"
down_revision = "20261014_0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Посадка пассажира: подтверждение «я в машине» (защита от случайного старта).
    op.add_column("ride_requests", sa.Column("passenger_boarded_at", sa.DateTime(timezone=True), nullable=True))
    # Контроль дистанции при завершении поездки.
    op.add_column("ride_requests", sa.Column("completion_distance_m", sa.Float(), nullable=True))
    # Продление ожидания на точке (водитель не должен стоять бесконечно).
    op.add_column("ride_requests", sa.Column("wait_extended_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("wait_extended_until", sa.DateTime(timezone=True), nullable=True))
    # Спор «поездка не начиналась» и авто-закрытие сторожем.
    op.add_column("ride_requests", sa.Column("dispute_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("dispute_reason", sa.String(), nullable=True))
    op.add_column("ride_requests", sa.Column("auto_resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("auto_resolve_reason", sa.String(), nullable=True))
    # Финансы отмены: возврат пассажиру и компенсация водителю.
    op.add_column("ride_requests", sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("refund_points", sa.Integer(), nullable=True))
    op.add_column("ride_requests", sa.Column("driver_compensation_points", sa.Integer(), nullable=True))
    op.add_column("ride_requests", sa.Column("settlement_reason", sa.String(), nullable=True))

    # Старые сообщения по заявкам из предложения водителя лежали в персональном
    # треде `r:<ride_id>`. Теперь это одна машина — переносим историю в `g:offer:<id>`,
    # чтобы попутчики сразу видели общий чат, а не пустой новый тред.
    op.execute(
        """
        UPDATE ride_chat_messages AS m
        SET thread_key = 'g:offer:' || r.offer_id
        FROM ride_requests AS r
        WHERE m.ride_id = r.id
          AND r.group_id IS NULL
          AND r.offer_id IS NOT NULL
          AND m.thread_key = 'r:' || r.id
        """
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "settlement_reason")
    op.drop_column("ride_requests", "driver_compensation_points")
    op.drop_column("ride_requests", "refund_points")
    op.drop_column("ride_requests", "refunded_at")
    op.drop_column("ride_requests", "auto_resolve_reason")
    op.drop_column("ride_requests", "auto_resolved_at")
    op.drop_column("ride_requests", "dispute_reason")
    op.drop_column("ride_requests", "dispute_at")
    op.drop_column("ride_requests", "wait_extended_until")
    op.drop_column("ride_requests", "wait_extended_at")
    op.drop_column("ride_requests", "completion_distance_m")
    op.drop_column("ride_requests", "passenger_boarded_at")
