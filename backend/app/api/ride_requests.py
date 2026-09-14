from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.api.auth import get_current_user, require_roles
from app.core.app_timezone import to_app_local_iso
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.user import User, UserRole
from app.services.driver_service import get_driver, is_driver_online
from app.services.driver_notification_service import notify_driver_ride_assigned
from app.services.passenger_notification_service import (
    notify_passenger_driver_assigned,
    notify_passenger_status_changed,
)
from app.services.ride_booking_service import (
    InsufficientPointsError,
    InvalidRideDateTimeError,
    RideQuoteUnavailableError,
    book_ride_with_points,
)
from app.services.rating_service import (
    RatingError,
    get_ride_rating_context_for_passenger,
    get_user_rating_aggregate,
    submit_passenger_rating,
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
from app.services.ride_route_update_service import (
    PointUpdate,
    RouteChangeActor,
    apply_route_update_with_notifications,
)


router = APIRouter(prefix="/ride-requests")

_PASSENGER_RIDE_ROLES = (
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


class RideRatingSubmitPayload(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class RideRatingOut(BaseModel):
    canRate: bool
    myScore: int | None = None
    myComment: str | None = None


class RideRequestUpdate(BaseModel):
    passengerName: str | None = Field(default=None, min_length=1)
    fromPoint: RoutePoint | None = None
    toPoint: RoutePoint | None = None
    dateTime: datetime | None = None


class RideRouteUpdate(BaseModel):
    fromPoint: RoutePoint | None = None
    toPoint: RoutePoint | None = None


class RideRequestOut(BaseModel):
    id: str
    rideNumber: int
    passengerId: str
    passengerName: str
    fromPoint: RoutePoint
    toPoint: RoutePoint
    dateTime: datetime
    dateTimeLocal: str
    status: str
    groupId: str | None
    driverId: str | None
    offerId: str | None = None
    pickupChangedByDriver: bool
    pickupConfirmedAt: datetime | None
    assignedDriver: "RideAssignedDriverOut | None" = None
    passengerRating: float = 5.0
    passengerRatingCount: int = 0
    rating: RideRatingOut | None = None
    createdAt: datetime


class RideAssignedDriverOut(BaseModel):
    id: str
    userId: str | None = None
    name: str
    photoUrl: str | None
    carBrand: str
    carModel: str
    carPlate: str
    vehicleColor: str
    seatsCount: int
    rating: float
    isOnline: bool
    currentLocation: LatLng | None


class RideRequestPage(BaseModel):
    items: list[RideRequestOut]
    total: int
    limit: int
    offset: int


def _to_ride_request_out(
    request,
    *,
    assigned_driver: RideAssignedDriverOut | None = None,
    passenger_rating: float = 5.0,
    passenger_rating_count: int = 0,
    rating: RideRatingOut | None = None,
) -> RideRequestOut:
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
        dateTimeLocal=to_app_local_iso(request.date_time),
        status=request.status,
        groupId=request.group_id,
        driverId=request.driver_id,
        offerId=request.offer_id,
        pickupChangedByDriver=request.pickup_changed_by_driver,
        pickupConfirmedAt=request.pickup_confirmed_at,
        assignedDriver=assigned_driver,
        passengerRating=passenger_rating,
        passengerRatingCount=passenger_rating_count,
        rating=rating,
        createdAt=request.created_at,
    )


def _to_ride_rating_out(ctx) -> RideRatingOut:
    return RideRatingOut(
        canRate=ctx.can_rate,
        myScore=ctx.my_score,
        myComment=ctx.my_comment,
    )


async def _build_ride_request_out(
    db_session: AsyncSession,
    request,
    *,
    assigned_driver: RideAssignedDriverOut | None = None,
    passenger_id_for_rating_ctx: str | None = None,
) -> RideRequestOut:
    passenger_aggregate = await get_user_rating_aggregate(db_session, request.passenger_id)
    rating = None
    if passenger_id_for_rating_ctx is not None:
        rating_ctx = await get_ride_rating_context_for_passenger(
            db_session,
            ride=request,
            passenger_id=passenger_id_for_rating_ctx,
        )
        rating = _to_ride_rating_out(rating_ctx)
    return _to_ride_request_out(
        request,
        assigned_driver=assigned_driver,
        passenger_rating=passenger_aggregate.rating,
        passenger_rating_count=passenger_aggregate.rating_count,
        rating=rating,
    )


async def _build_ride_request_out_with_driver(
    db_session: AsyncSession,
    request,
    *,
    passenger_id_for_rating_ctx: str | None = None,
) -> RideRequestOut:
    assigned_driver = None
    if request.driver_id:
        driver = await get_driver(db_session, driver_id=request.driver_id)
        if driver is not None:
            assigned_driver = _to_assigned_driver_out(driver)
    return await _build_ride_request_out(
        db_session,
        request,
        assigned_driver=assigned_driver,
        passenger_id_for_rating_ctx=passenger_id_for_rating_ctx,
    )


async def _build_ride_request_out_for_passenger(
    db_session: AsyncSession,
    request,
    *,
    passenger_id: str,
    assigned_driver: RideAssignedDriverOut | None = None,
) -> RideRequestOut:
    return await _build_ride_request_out(
        db_session,
        request,
        assigned_driver=assigned_driver,
        passenger_id_for_rating_ctx=passenger_id,
    )


def _to_assigned_driver_out(driver) -> RideAssignedDriverOut:
    effective_online = is_driver_online(
        driver,
        online_timeout_seconds=settings.driver_online_ttl_seconds,
    )
    current_location = None
    if effective_online and driver.current_lat is not None and driver.current_lng is not None:
        current_location = LatLng(lat=driver.current_lat, lng=driver.current_lng)
    return RideAssignedDriverOut(
        id=driver.id,
        userId=driver.user_id,
        name=driver.name,
        photoUrl=driver.photo_url,
        carBrand=driver.car_brand,
        carModel=driver.car_model,
        carPlate=driver.car_plate,
        vehicleColor=driver.vehicle_color,
        seatsCount=driver.seats_count,
        rating=driver.rating,
        isOnline=effective_online,
        currentLocation=current_location,
    )


_PASSENGER_RIDE_ROLES = (
    UserRole.PASSENGER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.MODERATOR,
)


@router.post("", response_model=RideRequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: RideRequestCreate,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
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
    except RideQuoteUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return await _build_ride_request_out_with_driver(db_session, request)


@router.get("/me", response_model=RideRequestPage)
async def list_my_requests(
    current_user: User = Depends(require_roles(UserRole.PASSENGER, UserRole.ADMIN, UserRole.MODERATOR, UserRole.DRIVER)),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    scope: str | None = Query(default=None, pattern="^(active|completed)$"),
    db_session: AsyncSession = Depends(get_db_session),
):
    requests, total = await list_passenger_requests(
        db_session,
        passenger_id=current_user.user_id,
        limit=limit,
        offset=offset,
        scope=scope,
    )
    items = []
    for request in requests:
        assigned_driver = None
        if request.driver_id:
            driver = await get_driver(db_session, driver_id=request.driver_id)
            if driver is not None:
                assigned_driver = _to_assigned_driver_out(driver)
        items.append(
            await _build_ride_request_out_for_passenger(
                db_session,
                request,
                passenger_id=current_user.user_id,
                assigned_driver=assigned_driver,
            )
        )
    return RideRequestPage(
        items=items,
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
    items = []
    for request in requests:
        assigned_driver = None
        if request.driver_id:
            driver = await get_driver(db_session, driver_id=request.driver_id)
            if driver is not None:
                assigned_driver = _to_assigned_driver_out(driver)
        items.append(await _build_ride_request_out(db_session, request, assigned_driver=assigned_driver))
    return RideRequestPage(
        items=items,
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
    assigned_driver = None
    if request.driver_id:
        driver = await get_driver(db_session, driver_id=request.driver_id)
        if driver is not None:
            assigned_driver = _to_assigned_driver_out(driver)
    if request.passenger_id == current_user.user_id:
        return await _build_ride_request_out_for_passenger(
            db_session,
            request,
            passenger_id=current_user.user_id,
            assigned_driver=assigned_driver,
        )
    return await _build_ride_request_out(db_session, request, assigned_driver=assigned_driver)


@router.post("/{request_id}/rate", response_model=RideRequestOut)
async def rate_ride_as_passenger(
    request_id: str,
    payload: RideRatingSubmitPayload,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        await submit_passenger_rating(
            db_session,
            ride_id=request_id,
            passenger_id=current_user.user_id,
            score=payload.score,
            comment=payload.comment,
        )
    except RatingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    request = await get_request(db_session, request_id=request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    assigned_driver = None
    if request.driver_id:
        driver = await get_driver(db_session, driver_id=request.driver_id)
        if driver is not None:
            assigned_driver = _to_assigned_driver_out(driver)
    return await _build_ride_request_out_for_passenger(
        db_session,
        request,
        passenger_id=current_user.user_id,
        assigned_driver=assigned_driver,
    )


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
    await notify_driver_ride_assigned(request=updated[0], driver=driver)
    return await _build_ride_request_out_with_driver(db_session, updated[0])


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
        await notify_driver_ride_assigned(request=request, driver=driver)
    items = []
    for request in updated:
        items.append(await _build_ride_request_out_with_driver(db_session, request))
    return items


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
    return await _build_ride_request_out_with_driver(db_session, request)


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

    is_route_edit = payload.fromPoint is not None or payload.toPoint is not None
    is_meta_edit = (
        payload.passengerName is not None
        or payload.dateTime is not None
    )
    if is_owner and not is_admin_user:
        if is_meta_edit and request.status != "pending":
            raise HTTPException(
                status_code=400,
                detail="Only pending requests can be edited by passenger.",
            )
        if is_route_edit and request.status == "completed":
            raise HTTPException(status_code=400, detail="Completed rides cannot be edited.")

    updated = request
    if is_route_edit:
        from_point = (
            PointUpdate(
                address=payload.fromPoint.address,
                lat=payload.fromPoint.latlng.lat,
                lng=payload.fromPoint.latlng.lng,
            )
            if payload.fromPoint is not None
            else None
        )
        to_point = (
            PointUpdate(
                address=payload.toPoint.address,
                lat=payload.toPoint.latlng.lat,
                lng=payload.toPoint.latlng.lng,
            )
            if payload.toPoint is not None
            else None
        )
        actor = RouteChangeActor.ADMIN if is_admin_user else RouteChangeActor.PASSENGER
        updated, route_error = await apply_route_update_with_notifications(
            db_session,
            request_id=request_id,
            actor=actor,
            passenger_id=current_user.user_id if actor == RouteChangeActor.PASSENGER else None,
            from_point=from_point,
            to_point=to_point,
        )
        if route_error is not None:
            raise HTTPException(status_code=400, detail=route_error)
        if updated is None:
            raise HTTPException(status_code=404, detail="Ride request not found.")

    if is_meta_edit:
        if is_owner and not is_admin_user and request.status != "pending":
            raise HTTPException(
                status_code=400,
                detail="Only pending requests can be edited by passenger.",
            )
        try:
            updated = await update_ride_request(
                db_session,
                request_id=request_id,
                passenger_name=payload.passengerName,
                date_time=payload.dateTime,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if updated is None:
            raise HTTPException(status_code=404, detail="Ride request not found.")

    passenger_id_for_rating_ctx = current_user.user_id if is_owner else None
    return await _build_ride_request_out_with_driver(
        db_session,
        updated,
        passenger_id_for_rating_ctx=passenger_id_for_rating_ctx,
    )


@router.patch("/{request_id}/route", response_model=RideRequestOut)
async def patch_request_route_admin(
    request_id: str,
    payload: RideRouteUpdate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    if payload.fromPoint is None and payload.toPoint is None:
        raise HTTPException(status_code=400, detail="At least one route point is required.")
    from_point = (
        PointUpdate(
            address=payload.fromPoint.address,
            lat=payload.fromPoint.latlng.lat,
            lng=payload.fromPoint.latlng.lng,
        )
        if payload.fromPoint is not None
        else None
    )
    to_point = (
        PointUpdate(
            address=payload.toPoint.address,
            lat=payload.toPoint.latlng.lat,
            lng=payload.toPoint.latlng.lng,
        )
        if payload.toPoint is not None
        else None
    )
    updated, route_error = await apply_route_update_with_notifications(
        db_session,
        request_id=request_id,
        actor=RouteChangeActor.ADMIN,
        from_point=from_point,
        to_point=to_point,
    )
    if route_error is not None:
        raise HTTPException(status_code=400, detail=route_error)
    if updated is None:
        raise HTTPException(status_code=404, detail="Ride request not found.")
    return await _build_ride_request_out_with_driver(db_session, updated)


@router.post("/{request_id}/confirm-pickup", response_model=RideRequestOut)
async def confirm_pickup(
    request_id: str,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
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
    return await _build_ride_request_out_with_driver(db_session, request)


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
