from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class NotificationPool:
    PASSENGER = "passenger"
    DRIVER = "driver"
    ADMIN = "admin"


class NotificationRecipientType:
    USER = "user"
    DRIVER = "driver"
    ADMIN_KEY = "admin_key"


class NotificationType:
    ADMIN_BROADCAST = "admin_broadcast"
    DRIVER_APPLICATION_NEW = "driver_application_new"
    INFO_BLOCK = "info_block"

    # --- События поездки (in-app дубль того, что уходит в Telegram) ---
    RIDE_ASSIGNED = "ride_assigned"
    RIDE_EN_ROUTE = "ride_en_route"
    RIDE_ARRIVED = "ride_arrived"
    RIDE_STARTED = "ride_started"
    RIDE_COMPLETED = "ride_completed"
    RIDE_CANCELLED = "ride_cancelled"
    RIDE_NO_SHOW = "ride_no_show"
    RIDE_STATUS_UNDO = "ride_status_undo"
    RIDE_PASSENGER_READY = "ride_passenger_ready"
    RIDE_PASSENGER_NUDGE = "ride_passenger_nudge"
    RIDE_CHAT_MESSAGE = "ride_chat_message"
    RIDE_WAIT_REMINDER = "ride_wait_reminder"
    RIDE_NO_SHOW_AVAILABLE = "ride_no_show_available"
    RIDE_DRIVER_LATE = "ride_driver_late"
    RIDE_EN_ROUTE_STUCK = "ride_en_route_stuck"
    RIDE_RIDE_STUCK = "ride_ride_stuck"
    RIDE_ADMIN_ATTENTION = "ride_admin_attention"

    RIDE_EVENTS: tuple[str, ...] = (
        RIDE_ASSIGNED,
        RIDE_EN_ROUTE,
        RIDE_ARRIVED,
        RIDE_STARTED,
        RIDE_COMPLETED,
        RIDE_CANCELLED,
        RIDE_NO_SHOW,
        RIDE_STATUS_UNDO,
        RIDE_PASSENGER_READY,
        RIDE_PASSENGER_NUDGE,
        RIDE_CHAT_MESSAGE,
        RIDE_WAIT_REMINDER,
        RIDE_NO_SHOW_AVAILABLE,
        RIDE_DRIVER_LATE,
        RIDE_EN_ROUTE_STUCK,
        RIDE_RIDE_STUCK,
        RIDE_ADMIN_ATTENTION,
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    pool = Column(String, nullable=False, index=True)
    recipient_type = Column(String, nullable=False)
    recipient_id = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    payload = Column(JSONB, nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_by_admin_key_id = Column(String, nullable=True)
    send_telegram = Column(Boolean, nullable=False, server_default="false")
