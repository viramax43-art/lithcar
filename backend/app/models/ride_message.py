from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class RideChatParticipantType:
    """Кто может читать и писать в чат поездки."""

    DRIVER = "driver"
    PASSENGER = "passenger"
    SYSTEM = "system"


class RideChatMessageKind:
    TEXT = "text"
    QUICK_REPLY = "quick_reply"
    SYSTEM = "system"
    LOCATION = "location"


class RideChatMessage(Base):
    """Сообщение в чате поездки.

    `thread_key` — идентификатор «экипажа» поездки:
    - `g:<group_id>`, если заявка сгруппирована (водитель + все попутчики одной машины);
    - `r:<ride_id>` для одиночной заявки.

    В одном thread_key состоят водитель и все пассажиры группы: у них общий чат,
    поэтому попутчики видят договорённости друг друга (кто где стоит, кто уже в машине).
    """

    __tablename__ = "ride_chat_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    thread_key = Column(String, nullable=False, index=True)
    ride_id = Column(
        String,
        ForeignKey("ride_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_type = Column(String, nullable=False)  # driver | passenger | system
    sender_id = Column(String, nullable=True)
    sender_name = Column(String, nullable=False, server_default="")
    kind = Column(String, nullable=False, server_default=RideChatMessageKind.TEXT)
    body = Column(Text, nullable=False)
    payload = Column(JSONB, nullable=True)
    is_pinned = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    __table_args__ = (
        Index("ix_ride_chat_messages_thread_created", "thread_key", "created_at"),
    )


class RideChatReadState(Base):
    """Отметка «дочитано до» для участника чата (водитель или пассажир).

    Нужна, чтобы считать непрочитанные сообщения без отдельной таблицы на каждое
    сообщение и без «дребезга» при массовых отметках.
    """

    __tablename__ = "ride_chat_read_states"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    thread_key = Column(String, nullable=False, index=True)
    reader_type = Column(String, nullable=False)  # driver | passenger
    reader_id = Column(String, nullable=False)
    last_read_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_read_message_id = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "thread_key",
            "reader_type",
            "reader_id",
            name="uq_ride_chat_read_state_reader",
        ),
    )
