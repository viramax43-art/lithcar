from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.pricing_settings import PricingSettings
from app.models.ride_request import RideRequest
from app.models.user import User
from app.services.pricing_service import (
    DEFAULT_POINT_PRICE_CENTS,
    DEFAULT_POINTS_PER_RIDE,
    DEFAULT_PRICING_MODE,
)
from app.services.ride_quote_service import calculate_ride_quote, default_pricing_formula_json
from app.services.ride_request_service import create_ride_request_record


class RideBookingError(Exception):
    """Base domain error for ride booking flow."""


class InsufficientPointsError(RideBookingError):
    def __init__(self, *, required_points: int, current_balance: int):
        super().__init__("Insufficient points balance.")
        self.required_points = required_points
        self.current_balance = current_balance


class InvalidRideDateTimeError(RideBookingError):
    pass


class RideQuoteUnavailableError(RideBookingError):
    pass


@dataclass
class RideBookingResult:
    request: RideRequest
    points_debited: int
    points_balance_after: int


async def _get_or_create_pricing_no_commit(db_session: AsyncSession) -> PricingSettings:
    pricing = await db_session.get(PricingSettings, 1)
    if pricing is not None:
        if pricing.pricing_formula_json is None:
            pricing.pricing_formula_json = default_pricing_formula_json()
        return pricing
    pricing = PricingSettings(
        id=1,
        points_per_ride=DEFAULT_POINTS_PER_RIDE,
        point_price_cents=DEFAULT_POINT_PRICE_CENTS,
        pricing_mode=DEFAULT_PRICING_MODE,
        pricing_formula_json=default_pricing_formula_json(),
    )
    db_session.add(pricing)
    await db_session.flush()
    return pricing


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _quote_breakdown_to_json(quote) -> list[dict] | None:
    if not quote.breakdown:
        return None
    return [asdict(line) for line in quote.breakdown]


async def book_ride_with_points(
    db_session: AsyncSession,
    *,
    user: User,
    passenger_name: str,
    from_address: str,
    from_lat: float,
    from_lng: float,
    to_address: str,
    to_lat: float,
    to_lng: float,
    date_time: datetime,
) -> RideBookingResult:
    normalized_date_time = _normalize_datetime(date_time)
    now = datetime.now(timezone.utc)
    if normalized_date_time <= now:
        raise InvalidRideDateTimeError("Ride date and time must be in the future.")
    max_date = now + timedelta(days=2)
    if normalized_date_time > max_date:
        raise InvalidRideDateTimeError("Ride can be planned at most 2 days ahead.")

    try:
        pricing = await _get_or_create_pricing_no_commit(db_session)

        ride_hour = normalized_date_time.hour
        ride_minute = normalized_date_time.minute
        ride_total_minutes = ride_hour * 60 + ride_minute

        work_start = pricing.work_start_time or "06:00"
        work_end = pricing.work_end_time or "19:00"
        interval = int(pricing.slot_interval_minutes or 30)

        start_h, start_m = (int(x) for x in work_start.split(":"))
        end_h, end_m = (int(x) for x in work_end.split(":"))
        start_total = start_h * 60 + start_m
        end_total = end_h * 60 + end_m

        if ride_total_minutes < start_total or ride_total_minutes > end_total:
            raise InvalidRideDateTimeError(
                f"Ride time must be between {work_start} and {work_end}."
            )
        if (ride_total_minutes - start_total) % interval != 0:
            raise InvalidRideDateTimeError(
                f"Ride time must align to {interval}-minute slots starting at {work_start}."
            )

        try:
            quote = await calculate_ride_quote(
                pricing,
                from_lat=from_lat,
                from_lng=from_lng,
                to_lat=to_lat,
                to_lng=to_lng,
            )
        except ValueError as exc:
            raise RideQuoteUnavailableError(str(exc)) from exc

        points_per_ride = int(quote.points)
        current_balance = int(user.points_balance or 0)
        if current_balance < points_per_ride:
            raise InsufficientPointsError(
                required_points=points_per_ride,
                current_balance=current_balance,
            )

        metrics = quote.metrics
        request = await create_ride_request_record(
            db_session,
            passenger_id=user.user_id,
            passenger_name=passenger_name,
            from_address=from_address,
            from_lat=from_lat,
            from_lng=from_lng,
            to_address=to_address,
            to_lat=to_lat,
            to_lng=to_lng,
            date_time=normalized_date_time,
            quoted_points=points_per_ride,
            quoted_price_cents=int(quote.price_cents),
            quote_road_km=metrics.road_km if metrics else None,
            quote_straight_km=metrics.straight_km if metrics else None,
            quote_circuity=metrics.circuity if metrics else None,
            quote_duration_min=metrics.duration_min if metrics else None,
            quote_tier_label=metrics.tier_label if metrics else None,
            quote_breakdown_json=_quote_breakdown_to_json(quote),
        )

        user.points_balance = current_balance - points_per_ride
        transaction = PointsTransaction(
            user_id=user.user_id,
            amount=-points_per_ride,
            transaction_type=PointsTransactionType.RIDE_BOOKING_DEBIT,
            reference_id=request.id,
            eur_amount_cents=int(quote.price_cents),
        )
        db_session.add(transaction)
        await db_session.flush()
        await db_session.commit()
    except Exception:
        await db_session.rollback()
        raise

    await db_session.refresh(user)
    await db_session.refresh(request)
    return RideBookingResult(
        request=request,
        points_debited=points_per_ride,
        points_balance_after=int(user.points_balance or 0),
    )
