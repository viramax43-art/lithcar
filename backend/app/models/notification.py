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
