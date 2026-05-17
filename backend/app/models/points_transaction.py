from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.models import Base


class PointsTransactionType:
    DRIVER_QR_TOP_UP = "driver_qr_top_up"
    RIDE_BOOKING_DEBIT = "ride_booking_debit"


class PointsTransaction(Base):
    __tablename__ = "points_transactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    transaction_type = Column(String, nullable=False, index=True)
    reference_id = Column(String, nullable=True, index=True)
    eur_amount_cents = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
