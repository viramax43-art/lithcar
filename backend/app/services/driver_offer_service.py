from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver import Driver
from app.models.driver_ride_offer import DriverRideOffer, DriverRideOfferStatus
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User
from app.services.block_service import are_users_blocked, get_blocked_user_ids_for_viewer
from app.services.driver_service import get_driver
from app.services.ride_booking_service import (
    InsufficientPointsError,
    InvalidRideDateTimeError,
    RideQuoteUnavailableError,
    _get_or_create_pricing_no_commit,
    _quote_breakdown_to_json,
    validate_ride_datetime,
)
from app.services.ride_quote_service import calculate_ride_quote
from app.services.ride_request_service import (
    ClaimRideError,
    _compute_route_order,
    create_ride_request_record,
)
from app.services.geo_service import haversine_km
from app.services.zone_service import is_point_in_any_active_zone


logger = logging.getLogger(__name__)

ACTIVE_CANCEL_BLOCK_STATUSES = {
    RideRequestStatus.EN_ROUTE_TO_PICKUP,
    RideRequestStatus.AWAITING_PASSENGER,
    RideRequestStatus.IN_PROGRESS,
}


class DriverOfferError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class BookOfferSeatResult:
    request: RideRequest
    offer: DriverRideOffer
    points_debited: int
    points_balance_after: int


async def _count_bookings_for_offer(db_session: AsyncSession, *, offer_id: str) -> int:
    result = await db_session.execute(
        select(func.count())
        .select_from(RideRequest)
        .where(RideRequest.offer_id == offer_id)
        .where(RideRequest.status != RideRequestStatus.COMPLETED)
    )
    return int(result.scalar_one() or 0)


async def _refresh_driver_route_order(db_session: AsyncSession, *, driver_id: str) -> None:
    result = await db_session.execute(
        select(RideRequest).where(
            RideRequest.driver_id == driver_id,
            RideRequest.status == RideRequestStatus.ASSIGNED,
        )
    )
    requests = list(result.scalars().all())
    if len(requests) > 1:
        ordered = await _compute_route_order(requests)
        for idx, req in enumerate(ordered):
            req.route_order = idx + 1
    elif len(requests) == 1:
        requests[0].route_order = 1


async def _maybe_mark_offer_completed(db_session: AsyncSession, offer: DriverRideOffer) -> None:
    if offer.status in (DriverRideOfferStatus.CANCELLED, DriverRideOfferStatus.COMPLETED):
        return
    now = datetime.now(timezone.utc)
    if offer.date_time >= now:
        return

    unfinished = await db_session.execute(
        select(func.count())
        .select_from(RideRequest)
        .where(RideRequest.offer_id == offer.id)
        .where(RideRequest.status != RideRequestStatus.COMPLETED)
    )
    if int(unfinished.scalar_one() or 0) > 0:
        return

    offer.status = DriverRideOfferStatus.COMPLETED
    offer.updated_at = now


async def _prepare_offer_for_read(db_session: AsyncSession, offer: DriverRideOffer) -> None:
    await _maybe_mark_offer_completed(db_session, offer)


async def create_driver_offer(
    db_session: AsyncSession,
    *,
    driver_id: str,
    from_address: str,
    from_lat: float,
    from_lng: float,
    to_address: str,
    to_lat: float,
    to_lng: float,
    date_time: datetime,
    total_seats: int,
) -> DriverRideOffer:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        raise DriverOfferError("not_found", "Driver not found.")

    if total_seats < 1:
        raise DriverOfferError("invalid_status", "totalSeats must be at least 1.")

    pricing = await _get_or_create_pricing_no_commit(db_session)
    try:
        normalized_date_time = validate_ride_datetime(
            date_time,
            work_start=pricing.work_start_time or "06:00",
            work_end=pricing.work_end_time or "19:00",
            slot_interval_minutes=int(pricing.slot_interval_minutes or 30),
        )
    except InvalidRideDateTimeError as exc:
        raise DriverOfferError("invalid_status", str(exc)) from exc

    is_from_allowed = await is_point_in_any_active_zone(db_session, lat=from_lat, lng=from_lng)
    is_to_allowed = await is_point_in_any_active_zone(db_session, lat=to_lat, lng=to_lng)
    if not is_from_allowed or not is_to_allowed:
        raise DriverOfferError("out_of_zone", "Route points are outside active service zones.")

    now = datetime.now(timezone.utc)
    offer = DriverRideOffer(
        driver_id=driver_id,
        from_address=from_address,
        from_lat=from_lat,
        from_lng=from_lng,
        to_address=to_address,
        to_lat=to_lat,
        to_lng=to_lng,
        date_time=normalized_date_time,
        total_seats=total_seats,
        seats_available=total_seats,
        status=DriverRideOfferStatus.OPEN,
        updated_at=now,
    )
    db_session.add(offer)
    await db_session.commit()
    await db_session.refresh(offer)
    return offer


async def list_driver_offers(
    db_session: AsyncSession,
    *,
    driver_id: str,
    status: str | None = None,
    limit: int,
    offset: int,
) -> tuple[list[DriverRideOffer], int]:
    conditions = [DriverRideOffer.driver_id == driver_id]
    if status and status != "all":
        conditions.append(DriverRideOffer.status == status)

    total_query = await db_session.execute(
        select(func.count()).select_from(DriverRideOffer).where(*conditions)
    )
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(
        select(DriverRideOffer)
        .where(*conditions)
        .order_by(DriverRideOffer.date_time.desc())
        .limit(limit)
        .offset(offset)
    )
    offers = list(result.scalars().all())
    for offer in offers:
        await _prepare_offer_for_read(db_session, offer)
    if offers:
        await db_session.commit()
    return offers, total


async def get_driver_offer(
    db_session: AsyncSession,
    *,
    offer_id: str,
    driver_id: str | None = None,
) -> DriverRideOffer | None:
    conditions = [DriverRideOffer.id == offer_id]
    if driver_id is not None:
        conditions.append(DriverRideOffer.driver_id == driver_id)
    result = await db_session.execute(select(DriverRideOffer).where(*conditions))
    offer = result.scalar_one_or_none()
    if offer is None:
        return None
    await _prepare_offer_for_read(db_session, offer)
    await db_session.commit()
    return offer


async def cancel_driver_offer(
    db_session: AsyncSession,
    *,
    offer_id: str,
    driver_id: str,
) -> DriverRideOffer:
    offer = await get_driver_offer(db_session, offer_id=offer_id, driver_id=driver_id)
    if offer is None:
        raise DriverOfferError("not_found", "Offer not found.")
    if offer.status in (DriverRideOfferStatus.CANCELLED, DriverRideOfferStatus.COMPLETED):
        raise DriverOfferError("invalid_status", f"Offer cannot be cancelled from status {offer.status}.")

    active_result = await db_session.execute(
        select(func.count())
        .select_from(RideRequest)
        .where(RideRequest.offer_id == offer.id)
        .where(RideRequest.status.in_(ACTIVE_CANCEL_BLOCK_STATUSES))
    )
    if int(active_result.scalar_one() or 0) > 0:
        raise DriverOfferError(
            "active_rides_in_progress",
            "Cannot cancel offer while rides are in progress.",
        )

    offer.status = DriverRideOfferStatus.CANCELLED
    offer.updated_at = datetime.now(timezone.utc)
    await db_session.commit()
    await db_session.refresh(offer)
    return offer


async def _passenger_active_offer_bookings(
    db_session: AsyncSession,
    *,
    passenger_id: str,
) -> dict[str, str]:
    result = await db_session.execute(
        select(RideRequest.offer_id, RideRequest.id)
        .where(RideRequest.passenger_id == passenger_id)
        .where(RideRequest.offer_id.isnot(None))
        .where(RideRequest.status != RideRequestStatus.COMPLETED)
    )
    bookings: dict[str, str] = {}
    for offer_id, request_id in result.all():
        if offer_id:
            bookings[str(offer_id)] = str(request_id)
    return bookings


async def _offer_visible_to_passenger(
    db_session: AsyncSession,
    offer: DriverRideOffer,
    *,
    pricing,
    date: str | None,
) -> int | None:
    if offer.status == DriverRideOfferStatus.CANCELLED:
        return None
    if offer.date_time < datetime.now(timezone.utc):
        return None
    is_from_allowed = await is_point_in_any_active_zone(
        db_session, lat=offer.from_lat, lng=offer.from_lng
    )
    is_to_allowed = await is_point_in_any_active_zone(
        db_session, lat=offer.to_lat, lng=offer.to_lng
    )
    if not is_from_allowed or not is_to_allowed:
        return None
    if date:
        from app.core.app_timezone import to_app_local

        local_date = to_app_local(offer.date_time).strftime("%Y-%m-%d")
        if local_date != date:
            return None
    try:
        quote = await calculate_ride_quote(
            pricing,
            from_lat=offer.from_lat,
            from_lng=offer.from_lng,
            to_lat=offer.to_lat,
            to_lng=offer.to_lng,
        )
        return int(quote.points)
    except ValueError:
        logger.warning("Skipping offer %s — quote unavailable.", offer.id)
        return None


@dataclass
class PassengerOfferListRow:
    offer: DriverRideOffer
    quoted_points: int
    booked_by_me: bool = False
    my_request_id: str | None = None


def _within_radius_km(
    offer: DriverRideOffer,
    *,
    center_lat: float,
    center_lng: float,
    radius_km: float,
) -> bool:
    dist = haversine_km(center_lat, center_lng, offer.from_lat, offer.from_lng)
    return dist <= radius_km


async def list_open_offers_for_passengers(
    db_session: AsyncSession,
    *,
    passenger_id: str | None = None,
    date: str | None = None,
    limit: int,
    offset: int,
    from_lat: float | None = None,
    from_lng: float | None = None,
    radius_km: float = 2.0,
) -> tuple[list[PassengerOfferListRow], int]:
    now = datetime.now(timezone.utc)
    conditions = [
        DriverRideOffer.status == DriverRideOfferStatus.OPEN,
        DriverRideOffer.seats_available > 0,
        DriverRideOffer.date_time >= now,
    ]
    total_query = await db_session.execute(
        select(func.count()).select_from(DriverRideOffer).where(*conditions)
    )
    raw_total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(
        select(DriverRideOffer)
        .where(*conditions)
        .order_by(DriverRideOffer.date_time.asc())
        .limit(max(limit + offset, limit))
        .offset(0)
    )
    offers = list(result.scalars().all())

    user_bookings = (
        await _passenger_active_offer_bookings(db_session, passenger_id=passenger_id)
        if passenger_id
        else {}
    )

    pricing = await _get_or_create_pricing_no_commit(db_session)
    blocked_ids: set[str] = set()
    if passenger_id:
        blocked_ids = await get_blocked_user_ids_for_viewer(
            db_session,
            viewer_id=passenger_id,
        )
    filtered: list[PassengerOfferListRow] = []
    seen_ids: set[str] = set()

    for offer in offers:
        await _prepare_offer_for_read(db_session, offer)
        if offer.status != DriverRideOfferStatus.OPEN or offer.seats_available <= 0:
            if offer.id not in user_bookings:
                continue
        quoted_points = await _offer_visible_to_passenger(
            db_session, offer, pricing=pricing, date=date
        )
        if quoted_points is None:
            continue
        if blocked_ids:
            driver = await db_session.get(Driver, offer.driver_id)
            driver_user_id = driver.user_id if driver else None
            if driver_user_id and driver_user_id in blocked_ids:
                continue
        booked_by_me = offer.id in user_bookings
        filtered.append(
            PassengerOfferListRow(
                offer=offer,
                quoted_points=quoted_points,
                booked_by_me=booked_by_me,
                my_request_id=user_bookings.get(offer.id),
            )
        )
        seen_ids.add(offer.id)

    for offer_id, request_id in user_bookings.items():
        if offer_id in seen_ids:
            continue
        extra = await db_session.get(DriverRideOffer, offer_id)
        if extra is None:
            continue
        await _prepare_offer_for_read(db_session, extra)
        quoted_points = await _offer_visible_to_passenger(
            db_session, extra, pricing=pricing, date=date
        )
        if quoted_points is None:
            continue
        if blocked_ids:
            driver = await db_session.get(Driver, extra.driver_id)
            driver_user_id = driver.user_id if driver else None
            if driver_user_id and driver_user_id in blocked_ids:
                continue
        filtered.append(
            PassengerOfferListRow(
                offer=extra,
                quoted_points=quoted_points,
                booked_by_me=True,
                my_request_id=request_id,
            )
        )

    if from_lat is not None and from_lng is not None:
        filtered = [
            row
            for row in filtered
            if row.booked_by_me
            or _within_radius_km(
                row.offer,
                center_lat=from_lat,
                center_lng=from_lng,
                radius_km=radius_km,
            )
        ]

    filtered.sort(key=lambda row: row.offer.date_time)

    if offers:
        await db_session.commit()

    page_items = filtered[offset : offset + limit]
    return page_items, len(filtered)


async def book_offer_seat(
    db_session: AsyncSession,
    *,
    offer_id: str,
    user: User,
    passenger_name: str,
) -> BookOfferSeatResult:
    try:
        result = await db_session.execute(
            select(DriverRideOffer).where(DriverRideOffer.id == offer_id).with_for_update()
        )
        offer = result.scalar_one_or_none()
        if offer is None:
            raise DriverOfferError("not_found", "Offer not found.")

        duplicate = await db_session.execute(
            select(func.count())
            .select_from(RideRequest)
            .where(RideRequest.offer_id == offer.id)
            .where(RideRequest.passenger_id == user.user_id)
            .where(RideRequest.status != RideRequestStatus.COMPLETED)
        )
        if int(duplicate.scalar_one() or 0) > 0:
            raise DriverOfferError("already_booked", "You have already booked this offer.")

        if offer.status != DriverRideOfferStatus.OPEN or offer.seats_available <= 0:
            raise DriverOfferError("offer_full", "No seats available for this offer.")

        pricing = await _get_or_create_pricing_no_commit(db_session)
        now = datetime.now(timezone.utc)
        if offer.date_time < now:
            raise DriverOfferError("invalid_status", "Offer departure time has passed.")
        try:
            validate_ride_datetime(
                offer.date_time,
                work_start=pricing.work_start_time or "06:00",
                work_end=pricing.work_end_time or "19:00",
                slot_interval_minutes=int(pricing.slot_interval_minutes or 30),
            )
        except InvalidRideDateTimeError as exc:
            raise DriverOfferError("invalid_status", str(exc)) from exc

        is_from_allowed = await is_point_in_any_active_zone(
            db_session, lat=offer.from_lat, lng=offer.from_lng
        )
        is_to_allowed = await is_point_in_any_active_zone(
            db_session, lat=offer.to_lat, lng=offer.to_lng
        )
        if not is_from_allowed or not is_to_allowed:
            raise DriverOfferError("out_of_zone", "Offer route is outside active service zones.")

        driver = await db_session.get(Driver, offer.driver_id)
        if driver is not None and driver.user_id == user.user_id:
            raise DriverOfferError("self_booking", "You cannot book your own offer.")
        if driver is not None and driver.user_id:
            if await are_users_blocked(
                db_session,
                user_a=user.user_id,
                user_b=driver.user_id,
            ):
                raise DriverOfferError(
                    "blocked",
                    "This action is not available because of a block.",
                )

        try:
            quote = await calculate_ride_quote(
                pricing,
                from_lat=offer.from_lat,
                from_lng=offer.from_lng,
                to_lat=offer.to_lat,
                to_lng=offer.to_lng,
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

        offer.seats_available -= 1
        if offer.seats_available == 0:
            offer.status = DriverRideOfferStatus.FULL
        offer.updated_at = now

        metrics = quote.metrics
        request = await create_ride_request_record(
            db_session,
            passenger_id=user.user_id,
            passenger_name=passenger_name,
            from_address=offer.from_address,
            from_lat=offer.from_lat,
            from_lng=offer.from_lng,
            to_address=offer.to_address,
            to_lat=offer.to_lat,
            to_lng=offer.to_lng,
            date_time=offer.date_time,
            quoted_points=points_per_ride,
            quoted_price_cents=int(quote.price_cents),
            quote_road_km=metrics.road_km if metrics else None,
            quote_straight_km=metrics.straight_km if metrics else None,
            quote_circuity=metrics.circuity if metrics else None,
            quote_duration_min=metrics.duration_min if metrics else None,
            quote_tier_label=metrics.tier_label if metrics else None,
            quote_breakdown_json=_quote_breakdown_to_json(quote),
            driver_id=offer.driver_id,
            offer_id=offer.id,
            status=RideRequestStatus.ASSIGNED,
        )

        await _refresh_driver_route_order(db_session, driver_id=offer.driver_id)

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
    await db_session.refresh(offer)
    return BookOfferSeatResult(
        request=request,
        offer=offer,
        points_debited=points_per_ride,
        points_balance_after=int(user.points_balance or 0),
    )


async def claim_request_with_offer(
    db_session: AsyncSession,
    *,
    request_id: str,
    driver_id: str,
    driver_can_self_assign: bool,
    offer_id: str,
) -> RideRequest:
    if not driver_can_self_assign:
        raise ClaimRideError("forbidden", "Driver cannot self-assign rides.")

    offer_result = await db_session.execute(
        select(DriverRideOffer).where(DriverRideOffer.id == offer_id).with_for_update()
    )
    offer = offer_result.scalar_one_or_none()
    if offer is None:
        raise ClaimRideError("not_found", "Offer not found.")
    if offer.driver_id != driver_id:
        raise ClaimRideError("invalid_offer", "Offer does not belong to this driver.")
    if offer.status not in (DriverRideOfferStatus.OPEN, DriverRideOfferStatus.FULL):
        raise ClaimRideError("invalid_status", f"Offer cannot be used from status {offer.status}.")
    if offer.seats_available <= 0:
        raise ClaimRideError("offer_full", "No seats available for this offer.")

    request_result = await db_session.execute(
        select(RideRequest).where(RideRequest.id == request_id).with_for_update()
    )
    request = request_result.scalar_one_or_none()
    if request is None:
        raise ClaimRideError("not_found", "Ride request not found.")

    driver = await db_session.get(Driver, driver_id)
    if driver and driver.user_id and request.passenger_id:
        if await are_users_blocked(
            db_session,
            user_a=driver.user_id,
            user_b=request.passenger_id,
        ):
            raise ClaimRideError(
                "blocked",
                "This action is not available because of a block.",
            )

    if request.driver_id and request.driver_id != driver_id:
        raise ClaimRideError("already_assigned", "Ride is already assigned to another driver.")

    if request.status not in (RideRequestStatus.PENDING, RideRequestStatus.GROUPED):
        raise ClaimRideError("invalid_status", f"Ride cannot be claimed from status {request.status}.")

    is_from_allowed = await is_point_in_any_active_zone(
        db_session, lat=request.from_lat, lng=request.from_lng
    )
    is_to_allowed = await is_point_in_any_active_zone(
        db_session, lat=request.to_lat, lng=request.to_lng
    )
    if not is_from_allowed or not is_to_allowed:
        raise ClaimRideError("out_of_zone", "Ride points are outside active service zones.")

    if request.driver_id == driver_id and request.status == RideRequestStatus.ASSIGNED:
        if request.offer_id != offer_id:
            request.offer_id = offer_id
            await db_session.commit()
        await db_session.refresh(request)
        return request

    now = datetime.now(timezone.utc)
    request.driver_id = driver_id
    request.status = RideRequestStatus.ASSIGNED
    request.offer_id = offer_id
    request.route_order = 1

    offer.seats_available -= 1
    if offer.seats_available == 0:
        offer.status = DriverRideOfferStatus.FULL
    offer.updated_at = now

    await _refresh_driver_route_order(db_session, driver_id=driver_id)
    await db_session.commit()
    await db_session.refresh(request)
    return request
