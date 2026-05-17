from __future__ import annotations

import secrets
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.models import Base


def generate_qr_sale_token() -> str:
    return secrets.token_urlsafe(24)


class DriverQrSaleSettlementStatus:
    OWED_TO_DRIVER = "owed_to_driver"
    CANCELLED_BEFORE_REDEEM = "cancelled_before_redeem"


class DriverQrSale(Base):
    __tablename__ = "driver_qr_sales"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    driver_id = Column(String, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(120), unique=True, nullable=False, index=True, default=generate_qr_sale_token)
    points_amount = Column(Integer, nullable=False)
    eur_amount_cents = Column(Integer, nullable=False)
    cash_settlement_status = Column(
        String,
        nullable=False,
        server_default=DriverQrSaleSettlementStatus.OWED_TO_DRIVER,
        index=True,
    )
    redeemed_by_user_id = Column(String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    redeemed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
