from sqlalchemy import Column, DateTime, Integer, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class PlatformSettings(Base):
    """Singleton platform configuration (id=1). Tunable from admin panel."""

    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, default=1)
    config_json = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
