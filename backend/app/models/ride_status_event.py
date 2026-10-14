from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class RideStatusActorType:
    DRIVER = "driver"
    PASSENGER = "passenger"
    ADMIN = "admin"
    SYSTEM = "system"


class RideStatusEvent(Base):
    """Журнал переходов статуса поездки.

    Зачем: разбор спорных ситуаций («водитель нажал Прибыл», «пассажир не вышел»,
    «статус откатили»). История неизменяемая — только добавление записей.
    """

    __tablename__ = "ride_status_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    ride_id = Column(
        String,
        ForeignKey("ride_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    actor_type = Column(String, nullable=False)
    actor_id = Column(String, nullable=True)
    reason_code = Column(String, nullable=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
