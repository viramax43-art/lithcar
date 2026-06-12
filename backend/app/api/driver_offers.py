from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.driver_portal import DriverSession, get_driver_session
from app.core.app_timezone import to_app_local_iso
from app.core.dependencies import get_db_session
from app.services.driver_offer_service import (
    DriverOfferError,
    cancel_driver_offer,
    create_driver_offer,
    get_driver_offer,
    list_driver_offers,
)


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
    totalSeats: int = Field(ge=1, le=12)


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
    createdAt: datetime
    updatedAt: datetime


class DriverRideOfferPage(BaseModel):
    items: list[DriverRideOfferOut]
    total: int
    limit: int
    offset: int


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


def _to_driver_offer_out(offer, *, bookings_count: int) -> DriverRideOfferOut:
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
    bookings_count = await _bookings_count(db_session, offer.id)
    return _to_driver_offer_out(offer, bookings_count=bookings_count)


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
    items = []
    for offer in offers:
        bookings_count = await _bookings_count(db_session, offer.id)
        items.append(_to_driver_offer_out(offer, bookings_count=bookings_count))
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
    bookings_count = await _bookings_count(db_session, offer.id)
    return _to_driver_offer_out(offer, bookings_count=bookings_count)


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
