from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, func

from app.models import Base


class DriverLoginTokenPurpose:
    APPROVAL = "approval"
    PROFILE = "profile"


class DriverLoginToken(Base):
    __tablename__ = "driver_login_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    driver_id = Column(String, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    purpose = Column(String(32), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
