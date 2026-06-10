from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func

from app.models import Base


class InfoBlockPool:
    PASSENGER = "passenger"
    DRIVER = "driver"


class InfoBlockReadRecipientType:
    USER = "user"
    DRIVER = "driver"


class InfoBlock(Base):
    __tablename__ = "info_blocks"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    pool = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="true")
    sort_order = Column(Integer, nullable=False, server_default="0")
    created_by_admin_key_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class InfoBlockRead(Base):
    __tablename__ = "info_block_reads"
    __table_args__ = (
        UniqueConstraint(
            "info_block_id",
            "recipient_type",
            "recipient_id",
            name="uq_info_block_reads_recipient",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    info_block_id = Column(String, ForeignKey("info_blocks.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_type = Column(String, nullable=False)
    recipient_id = Column(String, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
