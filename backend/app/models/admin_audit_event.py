from __future__ import annotations

from uuid import uuid4

from sqlalchemy import JSON, Column, DateTime, String, func

from app.models import Base


class AdminAuditAction:
    DRIVER_QR_ISSUED = "driver_qr_issued"
    DRIVER_QR_REDEEMED = "driver_qr_redeemed"


class AdminAuditEvent(Base):
    __tablename__ = "admin_audit_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    actor_type = Column(String, nullable=False, index=True)
    actor_id = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False, index=True)
    resource_id = Column(String, nullable=False, index=True)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
