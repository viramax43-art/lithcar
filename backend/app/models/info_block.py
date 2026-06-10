from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class InfoBlockPool:
    PASSENGER = "passenger"
    DRIVER = "driver"


class InfoBlockReadRecipientType:
    USER = "user"
    DRIVER = "driver"


class InfoBlockAudience:
    ALL = "all"
    USER = "user"


class InfoBlock(Base):
    __tablename__ = "info_blocks"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    pool = Column(String, nullable=False, index=True)
    title_i18n = Column(JSONB, nullable=False, server_default="{}")
    body_i18n = Column(JSONB, nullable=False, server_default="{}")
    is_active = Column(Boolean, nullable=False, server_default="true")
    sort_order = Column(Integer, nullable=False, server_default="0")
    audience = Column(String, nullable=False, server_default=InfoBlockAudience.ALL)
    target_username = Column(String, nullable=True)
    target_user_id = Column(String, nullable=True, index=True)
    target_driver_id = Column(String, nullable=True, index=True)
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
