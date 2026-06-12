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
from app.core.app_timezone import to_app_local_iso
from app.core.dependencies import get_db_session
from app.models.user import User, UserRole
from app.services.driver_offer_service import (
    DriverOfferError,
    book_offer_seat,
    get_driver_offer,
    list_open_offers_for_passengers,
)
from app.services.driver_notification_service import notify_driver_offer_booked
from app.services.driver_service import get_driver
from app.services.passenger_notification_service import notify_passenger_driver_assigned
from app.services.ride_booking_service import InsufficientPointsError, RideQuoteUnavailableError


router = APIRouter(prefix="/ride-offers")


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


class PassengerRideOfferPage(BaseModel):
    items: list[PassengerRideOfferOut]
    total: int
    limit: int
    offset: int


class BookOfferPayload(BaseModel):
    passengerName: str | None = Field(default=None, min_length=1)


def _to_passenger_offer_out(offer, *, quoted_points: int, driver_summary: OfferDriverSummary) -> PassengerRideOfferOut:
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
    )


async def _driver_summary(db_session: AsyncSession, driver_id: str) -> OfferDriverSummary | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    return OfferDriverSummary(
        id=driver.id,
        name=driver.name,
        photoUrl=driver.photo_url,
        carModel=driver.car_model,
        carPlate=driver.car_plate,
        rating=float(driver.rating or 0),
        seatsCount=int(driver.seats_count or 0),
    )


async def _build_passenger_offer_out(
    db_session: AsyncSession,
    offer,
    *,
    quoted_points: int,
) -> PassengerRideOfferOut | None:
    summary = await _driver_summary(db_session, offer.driver_id)
    if summary is None:
        return None
    return _to_passenger_offer_out(offer, quoted_points=quoted_points, driver_summary=summary)


@router.get("", response_model=PassengerRideOfferPage)
async def list_offers(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _user: User = Depends(require_roles(UserRole.PASSENGER)),
    db_session: AsyncSession = Depends(get_db_session),
):
    rows, total = await list_open_offers_for_passengers(
        db_session,
        date=date,
        limit=limit,
        offset=offset,
    )
    items: list[PassengerRideOfferOut] = []
    for offer, quoted_points in rows:
        if quoted_points is None:
            continue
        out = await _build_passenger_offer_out(db_session, offer, quoted_points=quoted_points)
        if out is not None:
            items.append(out)
    return PassengerRideOfferPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/{offer_id}", response_model=PassengerRideOfferOut)
async def get_offer(
    offer_id: str,
    _user: User = Depends(require_roles(UserRole.PASSENGER)),
    db_session: AsyncSession = Depends(get_db_session),
):
    from app.models.driver_ride_offer import DriverRideOfferStatus
    from app.services.ride_booking_service import _get_or_create_pricing_no_commit
    from app.services.ride_quote_service import calculate_ride_quote
    from app.services.zone_service import is_point_in_any_active_zone

    offer = await get_driver_offer(db_session, offer_id=offer_id)
    if offer is None or offer.status != DriverRideOfferStatus.OPEN or offer.seats_available <= 0:
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

    out = await _build_passenger_offer_out(db_session, offer, quoted_points=int(quote.points))
    if out is None:
        raise HTTPException(status_code=404, detail="Offer not found.")
    return out


@router.post("/{offer_id}/book", response_model=RideRequestOut, status_code=status.HTTP_201_CREATED)
async def book_offer(
    offer_id: str,
    payload: BookOfferPayload | None = None,
    user: User = Depends(require_roles(UserRole.PASSENGER)),
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
