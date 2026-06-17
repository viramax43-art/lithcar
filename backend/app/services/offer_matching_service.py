from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_timezone import normalize_app_datetime

from app.models.driver_ride_offer import DriverRideOffer, DriverRideOfferStatus
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User
from app.services.block_service import are_users_blocked
from app.services.driver_offer_service import PassengerOfferListRow, list_open_offers_for_passengers
from app.services.driver_service import get_driver
from app.services.geo_service import haversine_km
from app.services.zone_service import is_point_in_any_active_zone

PICKUP_RADIUS_KM = 2.0
DROPOFF_RADIUS_KM = 2.0
DATETIME_WINDOW_HOURS = 2
MATCH_THRESHOLD = 60
DISTANCE_NORMALIZER_KM = 10.0
TIME_NORMALIZER_MINUTES = 120.0
DISTANCE_WEIGHT = 0.65
TIME_WEIGHT = 0.35


@dataclass
class RouteMatchInput:
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    date_time: datetime | None


@dataclass
class MatchResult:
    score: int
    pickup_distance_km: float
    dropoff_distance_km: float
    time_delta_minutes: int | None
    reason: str


def _normalize_match_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return normalize_app_datetime(value)


def _time_delta_minutes(left: datetime | None, right: datetime | None) -> float | None:
    if left is None or right is None:
        return None
    return abs((left - right).total_seconds()) / 60.0


def _within_time_window(
    left: datetime | None,
    right: datetime | None,
    *,
    window_hours: float = DATETIME_WINDOW_HOURS,
) -> bool:
    delta = _time_delta_minutes(left, right)
    if delta is None:
        return False
    return delta <= window_hours * 60


def _build_match_reason(
    pickup_km: float,
    dropoff_km: float,
    time_delta_min: float | None,
    score: int,
) -> str:
    if time_delta_min is not None:
        time_part = f"время отличается на {int(time_delta_min)} мин. "
    else:
        time_part = ""
    return (
        f"Маршруты рядом ({pickup_km:.1f} + {dropoff_km:.1f} км), "
        f"{time_part}"
        f"Совпадение: {score}%."
    )


def passes_hard_filters(
    result: MatchResult,
    *,
    pickup_radius_km: float = PICKUP_RADIUS_KM,
    dropoff_radius_km: float = DROPOFF_RADIUS_KM,
    time_window_minutes: float = DATETIME_WINDOW_HOURS * 60,
    require_time_alignment: bool = False,
) -> bool:
    if result.pickup_distance_km > pickup_radius_km:
        return False
    if result.dropoff_distance_km > dropoff_radius_km:
        return False
    if require_time_alignment and result.time_delta_minutes is None:
        return False
    if result.time_delta_minutes is not None and result.time_delta_minutes > time_window_minutes:
        return False
    return True


def score_route_pair(left: RouteMatchInput, right: RouteMatchInput) -> MatchResult:
    pickup_km = haversine_km(left.from_lat, left.from_lng, right.from_lat, right.from_lng)
    dropoff_km = haversine_km(left.to_lat, left.to_lng, right.to_lat, right.to_lng)

    left_dt = _normalize_match_datetime(left.date_time)
    right_dt = _normalize_match_datetime(right.date_time)
    time_delta_min = _time_delta_minutes(left_dt, right_dt)

    distance_factor = max(0.0, 1.0 - ((pickup_km + dropoff_km) / DISTANCE_NORMALIZER_KM))
    if time_delta_min is not None:
        time_factor = max(0.0, 1.0 - (time_delta_min / TIME_NORMALIZER_MINUTES))
    else:
        time_factor = 0.0

    score = int(round((distance_factor * DISTANCE_WEIGHT + time_factor * TIME_WEIGHT) * 100))
    score = max(0, min(score, 100))

    reason = _build_match_reason(pickup_km, dropoff_km, time_delta_min, score)
    time_delta_int = int(time_delta_min) if time_delta_min is not None else None
    return MatchResult(
        score=score,
        pickup_distance_km=pickup_km,
        dropoff_distance_km=dropoff_km,
        time_delta_minutes=time_delta_int,
        reason=reason,
    )


def score_offer_for_passenger_route(
    offer: DriverRideOffer,
    passenger_route: RouteMatchInput,
) -> MatchResult:
    offer_route = RouteMatchInput(
        from_lat=offer.from_lat,
        from_lng=offer.from_lng,
        to_lat=offer.to_lat,
        to_lng=offer.to_lng,
        date_time=offer.date_time,
    )
    return score_route_pair(passenger_route, offer_route)


def score_request_for_offer(offer: DriverRideOffer, request: RideRequest) -> MatchResult:
    offer_route = RouteMatchInput(
        from_lat=offer.from_lat,
        from_lng=offer.from_lng,
        to_lat=offer.to_lat,
        to_lng=offer.to_lng,
        date_time=offer.date_time,
    )
    request_route = RouteMatchInput(
        from_lat=request.from_lat,
        from_lng=request.from_lng,
        to_lat=request.to_lat,
        to_lng=request.to_lng,
        date_time=request.date_time,
    )
    return score_route_pair(offer_route, request_route)


async def list_matching_offers_for_passenger_route(
    db_session: AsyncSession,
    *,
    passenger_id: str | None,
    route: RouteMatchInput,
    radius_km: float = PICKUP_RADIUS_KM,
    min_score: int = MATCH_THRESHOLD,
    limit: int = 20,
) -> list[tuple[PassengerOfferListRow, MatchResult]]:
    route_dt = _normalize_match_datetime(route.date_time)
    if route_dt is None:
        return []

    normalized_route = RouteMatchInput(
        from_lat=route.from_lat,
        from_lng=route.from_lng,
        to_lat=route.to_lat,
        to_lng=route.to_lng,
        date_time=route_dt,
    )
    rows, _ = await list_open_offers_for_passengers(
        db_session,
        passenger_id=passenger_id,
        limit=200,
        offset=0,
        from_lat=normalized_route.from_lat,
        from_lng=normalized_route.from_lng,
        radius_km=radius_km,
    )
    scored: list[tuple[PassengerOfferListRow, MatchResult]] = []
    for row in rows:
        if not _within_time_window(route_dt, row.offer.date_time):
            continue
        result = score_offer_for_passenger_route(row.offer, normalized_route)
        if result.score >= min_score and passes_hard_filters(
            result,
            pickup_radius_km=radius_km,
            require_time_alignment=True,
        ):
            scored.append((row, result))
    scored.sort(key=lambda item: (-item[1].score, item[0].offer.date_time))
    return scored[:limit]


async def list_matching_requests_for_offer(
    db_session: AsyncSession,
    *,
    driver_id: str,
    offer_id: str,
    min_score: int = MATCH_THRESHOLD,
    limit: int = 20,
) -> list[tuple[RideRequest, MatchResult, User | None]]:
    offer = await db_session.get(DriverRideOffer, offer_id)
    if offer is None or offer.driver_id != driver_id:
        return []

    driver = await get_driver(db_session, driver_id=driver_id)
    driver_user_id = driver.user_id if driver else None

    now = datetime.now(timezone.utc)
    result = await db_session.execute(
        select(RideRequest)
        .where(RideRequest.status.in_([RideRequestStatus.PENDING, RideRequestStatus.GROUPED]))
        .where(RideRequest.driver_id.is_(None))
        .where(RideRequest.offer_id.is_(None))
        .where(RideRequest.date_time >= now)
        .order_by(RideRequest.date_time.asc())
    )
    requests = list(result.scalars().all())

    scored: list[tuple[RideRequest, MatchResult, User | None]] = []
    for request in requests:
        is_from_allowed = await is_point_in_any_active_zone(
            db_session, lat=request.from_lat, lng=request.from_lng
        )
        is_to_allowed = await is_point_in_any_active_zone(
            db_session, lat=request.to_lat, lng=request.to_lng
        )
        if not is_from_allowed or not is_to_allowed:
            continue

        if driver_user_id and request.passenger_id:
            if await are_users_blocked(
                db_session,
                user_a=driver_user_id,
                user_b=request.passenger_id,
            ):
                continue

        match_result = score_request_for_offer(offer, request)
        if match_result.score >= min_score and passes_hard_filters(
            match_result,
            require_time_alignment=True,
        ):
            passenger_user = await db_session.get(User, request.passenger_id)
            scored.append((request, match_result, passenger_user))

    scored.sort(key=lambda item: (-item[1].score, item[0].date_time))
    return scored[:limit]
