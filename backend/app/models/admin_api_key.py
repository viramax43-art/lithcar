from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, func

from app.models import Base


class AdminApiRole:
    CHIEF_ADMIN = "chief_admin"
    ADMIN = "admin"
    MODERATOR = "moderator"


class AdminApiKey(Base):
    __tablename__ = "admin_api_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, index=True)
    key_hash = Column(String, nullable=False, unique=True, index=True)
    key_prefix = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_by_key_id = Column(String, ForeignKey("admin_api_keys.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
