from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class DriverApplicationStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DriverApplication(Base):
    __tablename__ = "driver_applications"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False, server_default=DriverApplicationStatus.PENDING)
    language = Column(String(8), nullable=False, server_default="lt")
    answers_json = Column(JSONB, nullable=False, server_default="{}")
    files_json = Column(JSONB, nullable=False, server_default="{}")
    rejection_reason = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_driver_id = Column(String, ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
