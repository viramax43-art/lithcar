from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, func

from app.models import Base


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, unique=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    photo_url = Column(String, nullable=True)
    car_brand = Column(String, nullable=False, server_default="Unknown")
    car_model = Column(String, nullable=False)
    car_plate = Column(String, nullable=False)
    vehicle_color = Column(String, nullable=False, server_default="Unknown")
    seats_count = Column(Integer, nullable=False, server_default="4")
    license_number = Column(String, nullable=False, server_default="")
    about = Column(String, nullable=False, server_default="")
    can_sell_points = Column(Boolean, nullable=False, server_default="false")
    access_key_hash = Column(String, nullable=True, unique=True, index=True)
    key_prefix = Column(String, nullable=True)
    rating = Column(Float, nullable=False, default=5.0)
    is_online = Column(Boolean, nullable=False, server_default="false")
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
