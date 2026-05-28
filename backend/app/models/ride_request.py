from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Sequence, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class RideRequestStatus:
    PENDING = "pending"
    GROUPED = "grouped"
    ASSIGNED = "assigned"
    EN_ROUTE_TO_PICKUP = "en_route_to_pickup"
    AWAITING_PASSENGER = "awaiting_passenger"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"

    DRIVER_FLOW_NEXT: dict[str, str] = {
        ASSIGNED: EN_ROUTE_TO_PICKUP,
        EN_ROUTE_TO_PICKUP: AWAITING_PASSENGER,
        AWAITING_PASSENGER: IN_PROGRESS,
        IN_PROGRESS: COMPLETED,
    }

    @classmethod
    def can_driver_transition(cls, current: str, target: str) -> bool:
        return cls.DRIVER_FLOW_NEXT.get(current) == target


class RideRequest(Base):
    __tablename__ = "ride_requests"

    ride_number_seq = Sequence("ride_requests_ride_number_seq")

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    ride_number = Column(
        Integer,
        ride_number_seq,
        server_default=ride_number_seq.next_value(),
        nullable=False,
        unique=True,
        index=True,
    )
    passenger_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    passenger_name = Column(String, nullable=False)
    from_address = Column(String, nullable=False)
    from_lat = Column(Float, nullable=False)
    from_lng = Column(Float, nullable=False)
    to_address = Column(String, nullable=False)
    to_lat = Column(Float, nullable=False)
    to_lng = Column(Float, nullable=False)
    date_time = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String, nullable=False, server_default=RideRequestStatus.PENDING, index=True)
    group_id = Column(String, nullable=True, index=True)
    driver_id = Column(String, ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, index=True)
    route_order = Column(Integer, nullable=True)
    pickup_changed_by_driver = Column(Boolean, nullable=False, server_default="false")
    pickup_notified_at = Column(DateTime(timezone=True), nullable=True)
    pickup_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    original_from_address = Column(String, nullable=True)
    original_from_lat = Column(Float, nullable=True)
    original_from_lng = Column(Float, nullable=True)
    quoted_points = Column(Integer, nullable=True)
    quoted_price_cents = Column(Integer, nullable=True)
    quote_road_km = Column(Float, nullable=True)
    quote_straight_km = Column(Float, nullable=True)
    quote_circuity = Column(Float, nullable=True)
    quote_duration_min = Column(Float, nullable=True)
    quote_tier_label = Column(String, nullable=True)
    quote_breakdown_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
