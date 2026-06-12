from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String, func

from app.models import Base


class DriverRideOfferStatus:
    OPEN = "open"
    FULL = "full"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class DriverRideOffer(Base):
    __tablename__ = "driver_ride_offers"
    __table_args__ = (
        CheckConstraint("total_seats >= 1 AND total_seats <= 12", name="ck_driver_ride_offers_total_seats"),
        CheckConstraint(
            "seats_available >= 0 AND seats_available <= total_seats",
            name="ck_driver_ride_offers_seats_available",
        ),
        CheckConstraint(
            "status IN ('open', 'full', 'cancelled', 'completed')",
            name="ck_driver_ride_offers_status",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    driver_id = Column(String, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    from_address = Column(String, nullable=False)
    from_lat = Column(Float, nullable=False)
    from_lng = Column(Float, nullable=False)
    to_address = Column(String, nullable=False)
    to_lat = Column(Float, nullable=False)
    to_lng = Column(Float, nullable=False)
    date_time = Column(DateTime(timezone=True), nullable=False, index=True)
    total_seats = Column(Integer, nullable=False)
    seats_available = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
