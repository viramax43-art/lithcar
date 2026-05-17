from sqlalchemy import Column, DateTime, Integer, func

from app.models import Base


class PricingSettings(Base):
    __tablename__ = "pricing_settings"

    id = Column(Integer, primary_key=True, default=1)
    points_per_ride = Column(Integer, nullable=False, default=10)
    point_price_cents = Column(Integer, nullable=False, default=50)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
