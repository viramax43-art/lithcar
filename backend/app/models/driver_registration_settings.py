from sqlalchemy import Column, DateTime, Integer, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class DriverRegistrationSettings(Base):
    __tablename__ = "driver_registration_settings"

    id = Column(Integer, primary_key=True, default=1)
    form_schema_json = Column(JSONB, nullable=False, server_default="{}")
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
