from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.driver_portal import DriverSession, get_driver_session
from app.core.app_timezone import to_app_local_iso
from app.core.dependencies import get_db_session
from app.services.offer_matching_service import list_matching_requests_for_offer
from app.services.rating_service import get_user_rating_aggregate
from app.services.driver_offer_service import (
    DriverOfferError,
    cancel_driver_offer,
    create_driver_offer,
    get_driver_offer,
    list_driver_offers,
)
from app.services.driver_service import get_driver


router = APIRouter(prefix="/driver/offers")


class LatLng(BaseModel):
    lat: float
    lng: float


class RoutePoint(BaseModel):
    address: str = Field(min_length=1)
    latlng: LatLng


class DriverRideOfferCreate(BaseModel):
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime
    totalSeats: int = Field(ge=1)


class DriverRideOfferOut(BaseModel):
    id: str
    driverId: str
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime
    dateTimeLocal: str
    totalSeats: int
    seatsAvailable: int
    status: str
    bookingsCount: int
    carBrand: str
    carModel: str
    createdAt: datetime
    updatedAt: datetime


class DriverRideOfferPage(BaseModel):
    items: list[DriverRideOfferOut]
    total: int
    limit: int
    offset: int


class MatchBreakdown(BaseModel):
    pickupDistanceKm: float
    dropoffDistanceKm: float
    timeDeltaMinutes: int | None


class MatchedRideRequestOut(BaseModel):
    id: str
    rideNumber: int
    passengerName: str
    passengerTelegramUsername: str | None = None
    passengerRating: float = 5.0
    passengerRatingCount: int = 0
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime
    dateTimeLocal: str
    status: str
    quotedPoints: int | None = None
    matchScore: int
    matchReason: str | None = None
    match: MatchBreakdown


class MatchedRequestPage(BaseModel):
    items: list[MatchedRideRequestOut]
    total: int


async def _bookings_count(db_session: AsyncSession, offer_id: str) -> int:
    from sqlalchemy import func, select

    from app.models.ride_request import RideRequest, RideRequestStatus

    result = await db_session.execute(
        select(func.count())
        .select_from(RideRequest)
        .where(RideRequest.offer_id == offer_id)
        .where(RideRequest.status != RideRequestStatus.COMPLETED)
    )
    return int(result.scalar_one() or 0)


def _to_driver_offer_out(
    offer,
    *,
    bookings_count: int,
    car_brand: str,
    car_model: str,
) -> DriverRideOfferOut:
    return DriverRideOfferOut(
        id=offer.id,
        driverId=offer.driver_id,
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
        totalSeats=offer.total_seats,
        seatsAvailable=offer.seats_available,
        status=offer.status,
        bookingsCount=bookings_count,
        carBrand=car_brand,
        carModel=car_model,
        createdAt=offer.created_at,
        updatedAt=offer.updated_at,
    )


@router.post("", response_model=DriverRideOfferOut, status_code=status.HTTP_201_CREATED)
async def create_offer(
    payload: DriverRideOfferCreate,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        offer = await create_driver_offer(
            db_session,
            driver_id=session.driver_id,
            from_address=payload.fromPoint.address,
            from_lat=payload.fromPoint.latlng.lat,
            from_lng=payload.fromPoint.latlng.lng,
            to_address=payload.toPoint.address,
            to_lat=payload.toPoint.latlng.lat,
            to_lng=payload.toPoint.latlng.lng,
            date_time=payload.dateTime,
            total_seats=payload.totalSeats,
        )
    except DriverOfferError as exc:
        if exc.code == "out_of_zone":
            raise HTTPException(status_code=400, detail=exc.message) from exc
        raise HTTPException(status_code=400, detail=exc.message) from exc
    driver = await get_driver(db_session, driver_id=session.driver_id)
    car_brand = driver.car_brand if driver else "Unknown"
    car_model = driver.car_model if driver else ""
    bookings_count = await _bookings_count(db_session, offer.id)
    return _to_driver_offer_out(
        offer,
        bookings_count=bookings_count,
        car_brand=car_brand,
        car_model=car_model,
    )


@router.get("", response_model=DriverRideOfferPage)
async def list_offers(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default="all"),
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    offers, total = await list_driver_offers(
        db_session,
        driver_id=session.driver_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    driver = await get_driver(db_session, driver_id=session.driver_id)
    car_brand = driver.car_brand if driver else "Unknown"
    car_model = driver.car_model if driver else ""
    items = []
    for offer in offers:
        bookings_count = await _bookings_count(db_session, offer.id)
        items.append(
            _to_driver_offer_out(
                offer,
                bookings_count=bookings_count,
                car_brand=car_brand,
                car_model=car_model,
            )
        )
    return DriverRideOfferPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/{offer_id}", response_model=DriverRideOfferOut)
async def get_offer(
    offer_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    offer = await get_driver_offer(db_session, offer_id=offer_id, driver_id=session.driver_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found.")
    driver = await get_driver(db_session, driver_id=session.driver_id)
    car_brand = driver.car_brand if driver else "Unknown"
    car_model = driver.car_model if driver else ""
    bookings_count = await _bookings_count(db_session, offer.id)
    return _to_driver_offer_out(
        offer,
        bookings_count=bookings_count,
        car_brand=car_brand,
        car_model=car_model,
    )


@router.get("/{offer_id}/matches", response_model=MatchedRequestPage)
async def list_offer_matches(
    offer_id: str,
    limit: int = Query(default=20, ge=1, le=50),
    minScore: int = Query(default=60, ge=0, le=100),
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    offer = await get_driver_offer(db_session, offer_id=offer_id, driver_id=session.driver_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found.")

    scored = await list_matching_requests_for_offer(
        db_session,
        driver_id=session.driver_id,
        offer_id=offer_id,
        min_score=minScore,
        limit=limit,
    )
    items: list[MatchedRideRequestOut] = []
    for request, match, passenger_user in scored:
        if passenger_user is not None:
            rating_aggregate = await get_user_rating_aggregate(db_session, passenger_user.user_id)
            passenger_rating = rating_aggregate.rating
            passenger_rating_count = rating_aggregate.rating_count
        else:
            passenger_rating = 5.0
            passenger_rating_count = 0
        items.append(
            MatchedRideRequestOut(
                id=request.id,
                rideNumber=request.ride_number,
                passengerName=request.passenger_name,
                passengerTelegramUsername=passenger_user.username if passenger_user else None,
                passengerRating=passenger_rating,
                passengerRatingCount=passenger_rating_count,
                fromPoint=RoutePoint(
                    address=request.from_address,
                    latlng=LatLng(lat=request.from_lat, lng=request.from_lng),
                ),
                toPoint=RoutePoint(
                    address=request.to_address,
                    latlng=LatLng(lat=request.to_lat, lng=request.to_lng),
                ),
                dateTime=request.date_time,
                dateTimeLocal=to_app_local_iso(request.date_time),
                status=request.status,
                quotedPoints=request.quoted_points,
                matchScore=match.score,
                matchReason=match.reason,
                match=MatchBreakdown(
                    pickupDistanceKm=match.pickup_distance_km,
                    dropoffDistanceKm=match.dropoff_distance_km,
                    timeDeltaMinutes=match.time_delta_minutes,
                ),
            )
        )
    return MatchedRequestPage(items=items, total=len(items))


@router.delete("/{offer_id}")
async def cancel_offer(
    offer_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        await cancel_driver_offer(
            db_session,
            offer_id=offer_id,
            driver_id=session.driver_id,
        )
    except DriverOfferError as exc:
        if exc.code == "not_found":
            raise HTTPException(status_code=404, detail=exc.message) from exc
        if exc.code == "active_rides_in_progress":
            raise HTTPException(
                status_code=409,
                detail={"code": "active_rides_in_progress", "message": exc.message},
            ) from exc
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return {"success": True}
