from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.api.auth import get_current_user, require_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.user import User, UserRole
from app.services.driver_service import get_driver
from app.services.passenger_notification_service import (
    notify_passenger_driver_assigned,
    notify_passenger_status_changed,
)
from app.services.ride_booking_service import (
    InsufficientPointsError,
    InvalidRideDateTimeError,
    book_ride_with_points,
)
from app.services.ride_request_service import (
    assign_driver,
    confirm_pickup_point,
    delete_ride_request,
    get_request,
    list_passenger_requests,
    list_requests,
    update_ride_request,
    update_request_status,
)


router = APIRouter(prefix="/ride-requests")


class LatLng(BaseModel):
    lat: float
    lng: float


class RoutePoint(BaseModel):
    address: str = Field(min_length=1)
    latlng: LatLng


class RideRequestCreate(BaseModel):
    passengerName: str = Field(min_length=1)
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime


class RideAssignPayload(BaseModel):
    driverId: str


class RidePointOverride(BaseModel):
    requestId: str
    fromPoint: RoutePoint | None = None
    toPoint: RoutePoint | None = None


class BulkRideAssignPayload(BaseModel):
    requestIds: list[str] = Field(min_length=1)
    driverId: str
    pointOverrides: list[RidePointOverride] | None = None


class RideStatusUpdatePayload(BaseModel):
    status: str


class RideRequestUpdate(BaseModel):
    passengerName: str | None = Field(default=None, min_length=1)
    fromPoint: RoutePoint | None = None
    toPoint: RoutePoint | None = None
    dateTime: datetime | None = None


class RideRequestOut(BaseModel):
    id: str
    rideNumber: int
    passengerId: str
    passengerName: str
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime
    status: str
    groupId: str | None
    driverId: str | None
    pickupChangedByDriver: bool
    pickupConfirmedAt: datetime | None
    createdAt: datetime


class RideRequestPage(BaseModel):
    items: list[RideRequestOut]
    total: int
    limit: int
    offset: int


def _to_ride_request_out(request) -> RideRequestOut:
    return RideRequestOut(
        id=request.id,
        rideNumber=request.ride_number,
        passengerId=request.passenger_id,
        passengerName=request.passenger_name,
        fromPoint=RoutePoint(
            address=request.from_address,
            latlng=LatLng(lat=request.from_lat, lng=request.from_lng),
        ),
        toPoint=RoutePoint(
            address=request.to_address,
            latlng=LatLng(lat=request.to_lat, lng=request.to_lng),
        ),
        dateTime=request.date_time,
        status=request.status,
        groupId=request.group_id,
        driverId=request.driver_id,
        pickupChangedByDriver=request.pickup_changed_by_driver,
        pickupConfirmedAt=request.pickup_confirmed_at,
        createdAt=request.created_at,
    )


@router.post("", response_model=RideRequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: RideRequestCreate,
    current_user: User = Depends(require_roles(UserRole.PASSENGER, UserRole.ADMIN, UserRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        booking_result = await book_ride_with_points(
            db_session,
            user=current_user,
            passenger_name=payload.passengerName,
            from_address=payload.fromPoint.address,
            from_lat=payload.fromPoint.latlng.lat,
            from_lng=payload.fromPoint.latlng.lng,
            to_address=payload.toPoint.address,
            to_lat=payload.toPoint.latlng.lat,
            to_lng=payload.toPoint.latlng.lng,
            date_time=payload.dateTime,
        )
        request = booking_result.request
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InvalidRideDateTimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InsufficientPointsError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "insufficient_points",
                "requiredPoints": exc.required_points,
                "currentBalance": exc.current_balance,
            },
        ) from exc
    return _to_ride_request_out(request)


@router.get("/me", response_model=RideRequestPage)
async def list_my_requests(
    current_user: User = Depends(require_roles(UserRole.PASSENGER, UserRole.ADMIN, UserRole.MODERATOR, UserRole.DRIVER)),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db_session: AsyncSession = Depends(get_db_session),
):
    requests, total = await list_passenger_requests(
        db_session,
        passenger_id=current_user.user_id,
        limit=limit,
        offset=offset,
    )
    return RideRequestPage(
        items=[_to_ride_request_out(request) for request in requests],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("", response_model=RideRequestPage)
async def list_all_requests(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    requests, total = await list_requests(
        db_session,
        status=status,
        limit=limit,
        offset=offset,
    )
    return RideRequestPage(
        items=[_to_ride_request_out(request) for request in requests],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{request_id}", response_model=RideRequestOut)
async def get_request_details(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")

    if current_user.role not in {UserRole.ADMIN, UserRole.MODERATOR} and request.passenger_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return _to_ride_request_out(request)


@router.patch("/{request_id}/assign", response_model=RideRequestOut)
async def assign_driver_single(
    request_id: str,
    payload: RideAssignPayload,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    updated = await assign_driver(db_session, request_ids=[request_id], driver_id=payload.driverId)
    if not updated:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    driver = await get_driver(db_session, driver_id=payload.driverId)
    await notify_passenger_driver_assigned(request=updated[0], driver=driver)
    return _to_ride_request_out(updated[0])


@router.post("/assign-bulk", response_model=list[RideRequestOut])
async def assign_driver_bulk(
    payload: BulkRideAssignPayload,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    overrides_dict: dict[str, dict] | None = None
    if payload.pointOverrides:
        overrides_dict = {}
        for item in payload.pointOverrides:
            entry: dict = {}
            if item.fromPoint is not None:
                entry["from"] = {
                    "address": item.fromPoint.address,
                    "latlng": {"lat": item.fromPoint.latlng.lat, "lng": item.fromPoint.latlng.lng},
                }
            if item.toPoint is not None:
                entry["to"] = {
                    "address": item.toPoint.address,
                    "latlng": {"lat": item.toPoint.latlng.lat, "lng": item.toPoint.latlng.lng},
                }
            if entry:
                overrides_dict[item.requestId] = entry
    try:
        updated = await assign_driver(
            db_session,
            request_ids=payload.requestIds,
            driver_id=payload.driverId,
            point_overrides=overrides_dict,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    driver = await get_driver(db_session, driver_id=payload.driverId)
    for request in updated:
        await notify_passenger_driver_assigned(request=request, driver=driver)
    return [_to_ride_request_out(request) for request in updated]


@router.patch("/{request_id}/status", response_model=RideRequestOut)
async def patch_request_status(
    request_id: str,
    payload: RideStatusUpdatePayload,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await get_request(db_session, request_id=request_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    previous_status = existing.status
    request = await update_request_status(db_session, request_id=request_id, status=payload.status)
    if request is None:  # defensive branch for race conditions
        raise HTTPException(status_code=404, detail="Ride request not found.")
    driver = None
    if request.driver_id:
        driver = await get_driver(db_session, driver_id=request.driver_id)
    await notify_passenger_status_changed(
        request=request,
        previous_status=previous_status,
        driver=driver,
    )
    return _to_ride_request_out(request)


@router.patch("/{request_id}", response_model=RideRequestOut)
async def patch_request(
    request_id: str,
    payload: RideRequestUpdate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    is_admin_user = current_user.role in {UserRole.ADMIN, UserRole.MODERATOR}
    is_owner = request.passenger_id == current_user.user_id
    if not is_admin_user and not is_owner:
        raise HTTPException(status_code=403, detail="Access denied.")
    if is_owner and not is_admin_user and request.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be edited by passenger.")
    try:
        updated = await update_ride_request(
            db_session,
            request_id=request_id,
            passenger_name=payload.passengerName,
            from_address=payload.fromPoint.address if payload.fromPoint else None,
            from_lat=payload.fromPoint.latlng.lat if payload.fromPoint else None,
            from_lng=payload.fromPoint.latlng.lng if payload.fromPoint else None,
            to_address=payload.toPoint.address if payload.toPoint else None,
            to_lat=payload.toPoint.latlng.lat if payload.toPoint else None,
            to_lng=payload.toPoint.latlng.lng if payload.toPoint else None,
            date_time=payload.dateTime,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    return _to_ride_request_out(updated)


@router.post("/{request_id}/confirm-pickup", response_model=RideRequestOut)
async def confirm_pickup(
    request_id: str,
    current_user: User = Depends(require_roles(UserRole.PASSENGER, UserRole.ADMIN, UserRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    request, error = await confirm_pickup_point(
        db_session,
        request_id=request_id,
        passenger_id=current_user.user_id,
    )
    if request is None:
        raise HTTPException(status_code=404, detail=error or "Ride request not found.")
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    return _to_ride_request_out(request)


@router.delete("/{request_id}")
async def remove_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    is_admin_user = current_user.role in {UserRole.ADMIN, UserRole.MODERATOR}
    is_owner = request.passenger_id == current_user.user_id
    if not is_admin_user and not is_owner:
        raise HTTPException(status_code=403, detail="Access denied.")
    if is_owner and not is_admin_user and request.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be deleted by passenger.")
    deleted = await delete_ride_request(db_session, request_id=request_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    return {"success": True}
