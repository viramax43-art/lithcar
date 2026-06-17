from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_roles
from app.api.ride_requests import (
    RideAssignedDriverOut,
    RideRequestOut,
    _build_ride_request_out_for_passenger,
    _to_assigned_driver_out,
)
from app.core.app_timezone import normalize_app_datetime, to_app_local_iso
from app.core.dependencies import get_db_session
from app.models.user import User, UserRole
from app.services.driver_offer_service import (
    DriverOfferError,
    book_offer_seat,
    get_driver_offer,
    list_open_offers_for_passengers,
)
from app.services.offer_matching_service import (
    RouteMatchInput,
    list_matching_offers_for_passenger_route,
)
from app.services.driver_notification_service import notify_driver_offer_booked
from app.services.driver_service import get_driver
from app.services.passenger_notification_service import notify_passenger_driver_assigned
from app.services.ride_booking_service import InsufficientPointsError, RideQuoteUnavailableError


router = APIRouter(prefix="/ride-offers")

# Drivers use the passenger mini-app too (book seats, view offers on the map).
_PASSENGER_OFFER_ROLES = (
    UserRole.PASSENGER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.MODERATOR,
)


class LatLng(BaseModel):
    lat: float
    lng: float


class RoutePoint(BaseModel):
    address: str = Field(min_length=1)
    latlng: LatLng


class OfferDriverSummary(BaseModel):
    id: str
    name: str
    photoUrl: str | None
    carModel: str
    carPlate: str
    rating: float
    seatsCount: int
    telegramUsername: str | None = None


class PassengerRideOfferOut(BaseModel):
    id: str
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime
    dateTimeLocal: str
    seatsAvailable: int
    totalSeats: int
    quotedPoints: int
    driver: OfferDriverSummary
    bookedByMe: bool = False
    myRequestId: str | None = None


class PassengerRideOfferPage(BaseModel):
    items: list[PassengerRideOfferOut]
    total: int
    limit: int
    offset: int


class MatchBreakdown(BaseModel):
    pickupDistanceKm: float
    dropoffDistanceKm: float
    timeDeltaMinutes: int | None


class MatchedPassengerRideOfferOut(PassengerRideOfferOut):
    matchScore: int
    matchReason: str | None = None
    match: MatchBreakdown


class MatchedOfferPage(BaseModel):
    items: list[MatchedPassengerRideOfferOut]
    total: int
    limit: int
    offset: int = 0


class BookOfferPayload(BaseModel):
    passengerName: str | None = Field(default=None, min_length=1)


def _to_passenger_offer_out(
    offer,
    *,
    quoted_points: int,
    driver_summary: OfferDriverSummary,
    booked_by_me: bool = False,
    my_request_id: str | None = None,
) -> PassengerRideOfferOut:
    return PassengerRideOfferOut(
        id=offer.id,
        fromPoint=RoutePoint(
            address=offer.from_address,
            latlng=LatLng(lat=offer.from_lat, lng=offer.from_lng),
        ),
        toPoint=RoutePoint(
            address=offer.to_address,
            latlng=LatLng(lat=offer.to_lat, lng=offer.to_lng),
        ),
        dateTime=offer.date_time,
        dateTimeLocal=to_app_local_iso(offer.date_time),
        seatsAvailable=offer.seats_available,
        totalSeats=offer.total_seats,
        quotedPoints=quoted_points,
        driver=driver_summary,
        bookedByMe=booked_by_me,
        myRequestId=my_request_id,
    )


async def _driver_summary(db_session: AsyncSession, driver_id: str) -> OfferDriverSummary | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    user = await db_session.get(User, driver.user_id) if driver.user_id else None
    return OfferDriverSummary(
        id=driver.id,
        name=driver.name,
        photoUrl=driver.photo_url,
        carModel=driver.car_model,
        carPlate=driver.car_plate,
        rating=float(driver.rating or 0),
        seatsCount=int(driver.seats_count or 0),
        telegramUsername=user.username if user else None,
    )


async def _build_passenger_offer_out(
    db_session: AsyncSession,
    offer,
    *,
    quoted_points: int,
    booked_by_me: bool = False,
    my_request_id: str | None = None,
) -> PassengerRideOfferOut | None:
    summary = await _driver_summary(db_session, offer.driver_id)
    if summary is None:
        return None
    return _to_passenger_offer_out(
        offer,
        quoted_points=quoted_points,
        driver_summary=summary,
        booked_by_me=booked_by_me,
        my_request_id=my_request_id,
    )


@router.get("", response_model=PassengerRideOfferPage)
async def list_offers(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    fromLat: float | None = Query(default=None),
    fromLng: float | None = Query(default=None),
    radiusKm: float = Query(default=2.0, ge=0.1, le=10.0),
    user: User = Depends(require_roles(*_PASSENGER_OFFER_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    if (fromLat is not None and fromLng is None) or (fromLng is not None and fromLat is None):
        raise HTTPException(status_code=422, detail="fromLat and fromLng must be provided together.")

    rows, total = await list_open_offers_for_passengers(
        db_session,
        passenger_id=user.user_id,
        date=date,
        limit=limit,
        offset=offset,
        from_lat=fromLat,
        from_lng=fromLng,
        radius_km=radiusKm,
    )
    items: list[PassengerRideOfferOut] = []
    for row in rows:
        out = await _build_passenger_offer_out(
            db_session,
            row.offer,
            quoted_points=row.quoted_points,
            booked_by_me=row.booked_by_me,
            my_request_id=row.my_request_id,
        )
        if out is not None:
            items.append(out)
    return PassengerRideOfferPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/matches", response_model=MatchedOfferPage)
async def list_matching_offers(
    fromLat: float = Query(...),
    fromLng: float = Query(...),
    toLat: float = Query(...),
    toLng: float = Query(...),
    dateTime: datetime | None = Query(default=None),
    radiusKm: float = Query(default=2.0, ge=0.1, le=10.0),
    limit: int = Query(default=20, ge=1, le=50),
    minScore: int = Query(default=60, ge=0, le=100),
    user: User = Depends(require_roles(*_PASSENGER_OFFER_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    route = RouteMatchInput(
        from_lat=fromLat,
        from_lng=fromLng,
        to_lat=toLat,
        to_lng=toLng,
        date_time=normalize_app_datetime(dateTime) if dateTime is not None else None,
    )
    scored = await list_matching_offers_for_passenger_route(
        db_session,
        passenger_id=user.user_id,
        route=route,
        radius_km=radiusKm,
        min_score=minScore,
        limit=limit,
    )
    items: list[MatchedPassengerRideOfferOut] = []
    for row, match in scored:
        out = await _build_passenger_offer_out(
            db_session,
            row.offer,
            quoted_points=row.quoted_points,
            booked_by_me=row.booked_by_me,
            my_request_id=row.my_request_id,
        )
        if out is None:
            continue
        items.append(
            MatchedPassengerRideOfferOut(
                **out.model_dump(),
                matchScore=match.score,
                matchReason=match.reason,
                match=MatchBreakdown(
                    pickupDistanceKm=match.pickup_distance_km,
                    dropoffDistanceKm=match.dropoff_distance_km,
                    timeDeltaMinutes=match.time_delta_minutes,
                ),
            )
        )
    return MatchedOfferPage(items=items, total=len(items), limit=limit, offset=0)


@router.get("/{offer_id}", response_model=PassengerRideOfferOut)
async def get_offer(
    offer_id: str,
    user: User = Depends(require_roles(*_PASSENGER_OFFER_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    from app.models.driver_ride_offer import DriverRideOfferStatus
    from app.services.ride_booking_service import _get_or_create_pricing_no_commit
    from app.services.ride_quote_service import calculate_ride_quote
    from app.services.zone_service import is_point_in_any_active_zone

    from app.services.driver_offer_service import _passenger_active_offer_bookings

    bookings = await _passenger_active_offer_bookings(db_session, passenger_id=user.user_id)
    booked_by_me = offer_id in bookings

    offer = await get_driver_offer(db_session, offer_id=offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found.")
    if not booked_by_me and (
        offer.status != DriverRideOfferStatus.OPEN or offer.seats_available <= 0
    ):
        raise HTTPException(status_code=404, detail="Offer not found.")

    is_from_allowed = await is_point_in_any_active_zone(
        db_session, lat=offer.from_lat, lng=offer.from_lng
    )
    is_to_allowed = await is_point_in_any_active_zone(
        db_session, lat=offer.to_lat, lng=offer.to_lng
    )
    if not is_from_allowed or not is_to_allowed:
        raise HTTPException(status_code=404, detail="Offer not found.")

    pricing = await _get_or_create_pricing_no_commit(db_session)
    try:
        quote = await calculate_ride_quote(
            pricing,
            from_lat=offer.from_lat,
            from_lng=offer.from_lng,
            to_lat=offer.to_lat,
            to_lng=offer.to_lng,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Offer not found.") from exc

    out = await _build_passenger_offer_out(
        db_session,
        offer,
        quoted_points=int(quote.points),
        booked_by_me=offer_id in bookings,
        my_request_id=bookings.get(offer_id),
    )
    if out is None:
        raise HTTPException(status_code=404, detail="Offer not found.")
    return out


@router.post("/{offer_id}/book", response_model=RideRequestOut, status_code=status.HTTP_201_CREATED)
async def book_offer(
    offer_id: str,
    payload: BookOfferPayload | None = None,
    user: User = Depends(require_roles(*_PASSENGER_OFFER_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    passenger_name = (payload.passengerName if payload else None) or user.username or user.user_id
    try:
        result = await book_offer_seat(
            db_session,
            offer_id=offer_id,
            user=user,
            passenger_name=passenger_name,
        )
    except DriverOfferError as exc:
        if exc.code == "not_found":
            raise HTTPException(status_code=404, detail=exc.message) from exc
        if exc.code in ("offer_full", "already_booked"):
            raise HTTPException(
                status_code=409,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        if exc.code == "self_booking":
            raise HTTPException(status_code=403, detail=exc.message) from exc
        if exc.code == "blocked":
            raise HTTPException(
                status_code=403,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        if exc.code == "out_of_zone":
            raise HTTPException(status_code=400, detail=exc.message) from exc
        raise HTTPException(status_code=400, detail=exc.message) from exc
    except InsufficientPointsError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "insufficient_points",
                "requiredPoints": exc.required_points,
                "currentBalance": exc.current_balance,
            },
        ) from exc
    except RideQuoteUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    driver = await get_driver(db_session, driver_id=result.request.driver_id or "")
    assigned_driver = _to_assigned_driver_out(driver) if driver else None
    await notify_passenger_driver_assigned(request=result.request, driver=driver)
    await notify_driver_offer_booked(
        offer=result.offer,
        request=result.request,
        passenger_name=passenger_name,
    )
    return await _build_ride_request_out_for_passenger(
        db_session,
        result.request,
        passenger_id=user.user_id,
        assigned_driver=assigned_driver,
    )
