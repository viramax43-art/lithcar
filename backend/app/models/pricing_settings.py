from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.models import Base


class PricingSettings(Base):
    __tablename__ = "pricing_settings"

    id = Column(Integer, primary_key=True, default=1)
    points_per_ride = Column(Integer, nullable=False, default=10)
    point_price_cents = Column(Integer, nullable=False, default=50)
    user_info_text = Column(Text, nullable=False, server_default="")
    work_start_time = Column(String, nullable=False, server_default="06:00")
    work_end_time = Column(String, nullable=False, server_default="19:00")
    slot_interval_minutes = Column(Integer, nullable=False, server_default="30")
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
