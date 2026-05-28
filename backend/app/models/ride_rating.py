from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, SmallInteger, String, Text, UniqueConstraint, func

from app.models import Base


class RaterRole:
    PASSENGER = "passenger"
    DRIVER = "driver"


class RideRating(Base):
    __tablename__ = "ride_ratings"
    __table_args__ = (
        UniqueConstraint("ride_request_id", "rater_role", name="uq_ride_ratings_ride_rater"),
        CheckConstraint("score >= 1 AND score <= 5", name="ck_ride_ratings_score_range"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    ride_request_id = Column(
        String,
        ForeignKey("ride_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rater_role = Column(String, nullable=False)
    score = Column(SmallInteger, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
