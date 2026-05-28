from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class MapDrawing(Base):
    __tablename__ = "map_drawings"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    title = Column(String, nullable=False)
    color = Column(String, nullable=False, server_default="#DC2626")
    stroke_width = Column(Integer, nullable=False, server_default="4")
    points = Column(JSONB, nullable=False)
    created_by_role = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
