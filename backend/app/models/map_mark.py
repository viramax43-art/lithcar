from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, String, func

from app.models import Base


class MapMark(Base):
    __tablename__ = "map_marks"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    title = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    visibility = Column(String, nullable=False, server_default="admin_only", index=True)
    photo_key = Column(String, nullable=True)
    created_by_role = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
