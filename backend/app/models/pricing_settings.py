from sqlalchemy import Column, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class PricingSettings(Base):
    __tablename__ = "pricing_settings"

    id = Column(Integer, primary_key=True, default=1)
    points_per_ride = Column(Integer, nullable=False, default=10)
    point_price_cents = Column(Integer, nullable=False, default=50)
    pricing_mode = Column(String, nullable=False, server_default="fixed")
    pricing_formula_json = Column(JSONB, nullable=False)
    user_info_text_i18n = Column(JSONB, nullable=False, server_default="{}")
    user_info_text_profile_i18n = Column(JSONB, nullable=False, server_default="{}")
    work_start_time = Column(String, nullable=False, server_default="06:00")
    work_end_time = Column(String, nullable=False, server_default="19:00")
    slot_interval_minutes = Column(Integer, nullable=False, server_default="30")
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
