"""ride lifecycle timers, chat and status journal

Revision ID: 20261014_0043
Revises: 20260930_0042
Create Date: 2026-10-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261014_0043"
down_revision = "20260930_0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Таймеры и факты жизненного цикла: «Еду на точку», «Прибыл», ожидание, неявка.
    op.add_column("ride_requests", sa.Column("en_route_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("status_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("passenger_ready_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("arrival_distance_m", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("arrival_reminder_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("no_show_available_notified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("driver_late_reminded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("nudge_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("admin_attention_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ride_requests", sa.Column("admin_attention_reason", sa.String(), nullable=True))
    op.add_column("ride_requests", sa.Column("cancelled_by", sa.String(), nullable=True))
    op.add_column("ride_requests", sa.Column("cancel_reason", sa.String(), nullable=True))
    op.add_column("ride_requests", sa.Column("cancel_comment", sa.String(), nullable=True))
    op.create_index(
        "ix_ride_requests_status_updated_at",
        "ride_requests",
        ["status_updated_at"],
        unique=False,
    )

    # 2. Журнал переходов статуса — база для разбора спорных ситуаций.
    op.create_table(
        "ride_status_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("ride_id", sa.String(), nullable=False),
        sa.Column("from_status", sa.String(), nullable=True),
        sa.Column("to_status", sa.String(), nullable=False),
        sa.Column("actor_type", sa.String(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=True),
        sa.Column("reason_code", sa.String(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ride_id"], ["ride_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ride_status_events_ride_id", "ride_status_events", ["ride_id"], unique=False)
    op.create_index("ix_ride_status_events_created_at", "ride_status_events", ["created_at"], unique=False)

    # 3. Чат поездки: водитель + все попутчики одной машины (thread_key = группа или заявка).
    op.create_table(
        "ride_chat_messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("thread_key", sa.String(), nullable=False),
        sa.Column("ride_id", sa.String(), nullable=False),
        sa.Column("sender_type", sa.String(), nullable=False),
        sa.Column("sender_id", sa.String(), nullable=True),
        sa.Column("sender_name", sa.String(), server_default="", nullable=False),
        sa.Column("kind", sa.String(), server_default="text", nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ride_id"], ["ride_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ride_chat_messages_thread_key", "ride_chat_messages", ["thread_key"], unique=False)
    op.create_index("ix_ride_chat_messages_ride_id", "ride_chat_messages", ["ride_id"], unique=False)
    op.create_index("ix_ride_chat_messages_created_at", "ride_chat_messages", ["created_at"], unique=False)
    op.create_index(
        "ix_ride_chat_messages_thread_created",
        "ride_chat_messages",
        ["thread_key", "created_at"],
        unique=False,
    )

    op.create_table(
        "ride_chat_read_states",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("thread_key", sa.String(), nullable=False),
        sa.Column("reader_type", sa.String(), nullable=False),
        sa.Column("reader_id", sa.String(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_read_message_id", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "thread_key",
            "reader_type",
            "reader_id",
            name="uq_ride_chat_read_state_reader",
        ),
    )
    op.create_index("ix_ride_chat_read_states_thread_key", "ride_chat_read_states", ["thread_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ride_chat_read_states_thread_key", table_name="ride_chat_read_states")
    op.drop_table("ride_chat_read_states")

    op.drop_index("ix_ride_chat_messages_thread_created", table_name="ride_chat_messages")
    op.drop_index("ix_ride_chat_messages_created_at", table_name="ride_chat_messages")
    op.drop_index("ix_ride_chat_messages_ride_id", table_name="ride_chat_messages")
    op.drop_index("ix_ride_chat_messages_thread_key", table_name="ride_chat_messages")
    op.drop_table("ride_chat_messages")

    op.drop_index("ix_ride_status_events_created_at", table_name="ride_status_events")
    op.drop_index("ix_ride_status_events_ride_id", table_name="ride_status_events")
    op.drop_table("ride_status_events")

    op.drop_index("ix_ride_requests_status_updated_at", table_name="ride_requests")
    for column in (
        "cancel_comment",
        "cancel_reason",
        "cancelled_by",
        "admin_attention_reason",
        "admin_attention_at",
        "nudge_sent_at",
        "driver_late_reminded_at",
        "no_show_available_notified_at",
        "arrival_reminder_sent_at",
        "arrival_distance_m",
        "passenger_ready_at",
        "status_updated_at",
        "cancelled_at",
        "completed_at",
        "started_at",
        "arrived_at",
        "en_route_at",
    ):
        op.drop_column("ride_requests", column)