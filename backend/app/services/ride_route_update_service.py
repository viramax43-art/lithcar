from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ride_request import RideRequest, RideRequestStatus
from app.services.ride_request_service import get_request
from app.services.zone_service import snap_pickup_coordinates

RoutePointKind = Literal["from", "to"]
_COORD_EPSILON = 1e-6


class RouteChangeActor(str, Enum):
    PASSENGER = "passenger"
    DRIVER = "driver"
    ADMIN = "admin"


@dataclass(frozen=True)
class PointUpdate:
    address: str
    lat: float
    lng: float


@dataclass(frozen=True)
class RouteChangeResult:
    changed: frozenset[RoutePointKind]


def _point_changed(
    *,
    current_address: str,
    current_lat: float,
    current_lng: float,
    update: PointUpdate | None,
) -> bool:
    if update is None:
        return False
    if current_address.strip() != update.address.strip():
        return True
    if abs(current_lat - update.lat) > _COORD_EPSILON:
        return True
    if abs(current_lng - update.lng) > _COORD_EPSILON:
        return True
    return False


def _reset_pickup_confirmation_flags(request: RideRequest) -> None:
    request.pickup_changed_by_driver = False
    request.pickup_notified_at = None
    request.pickup_confirmed_at = None
    request.pickup_revision = 0
    request.original_from_address = None
    request.original_from_lat = None
    request.original_from_lng = None


def _bump_pickup_revision(request: RideRequest) -> int:
    request.pickup_revision = int(request.pickup_revision or 0) + 1
    return request.pickup_revision


async def update_ride_route_points(
    db_session: AsyncSession,
    *,
    request_id: str,
    actor: RouteChangeActor,
    passenger_id: str | None = None,
    driver_id: str | None = None,
    from_point: PointUpdate | None = None,
    to_point: PointUpdate | None = None,
) -> tuple[RideRequest | None, RouteChangeResult | None, str | None]:
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, None, "Поездка не найдена."
    if request.status == RideRequestStatus.COMPLETED:
        return None, None, "Нельзя изменить маршрут завершённой поездки."

    if actor == RouteChangeActor.PASSENGER:
        if passenger_id is None or request.passenger_id != passenger_id:
            return None, None, "Эта поездка не принадлежит вам."
    elif actor == RouteChangeActor.DRIVER:
        if driver_id is None or request.driver_id != driver_id:
            return None, None, "Эта поездка не назначена вам."

    from_changed = _point_changed(
        current_address=request.from_address,
        current_lat=request.from_lat,
        current_lng=request.from_lng,
        update=from_point,
    )
    to_changed = _point_changed(
        current_address=request.to_address,
        current_lat=request.to_lat,
        current_lng=request.to_lng,
        update=to_point,
    )
    if not from_changed and not to_changed:
        return request, RouteChangeResult(changed=frozenset()), None

    next_from_lat = from_point.lat if from_point is not None else request.from_lat
    next_from_lng = from_point.lng if from_point is not None else request.from_lng
    next_to_lat = to_point.lat if to_point is not None else request.to_lat
    next_to_lng = to_point.lng if to_point is not None else request.to_lng

    if from_changed:
        next_from_lat, next_from_lng = await snap_pickup_coordinates(
            db_session,
            lat=next_from_lat,
            lng=next_from_lng,
        )
        if from_point is not None and (
            abs(next_from_lat - from_point.lat) > _COORD_EPSILON
            or abs(next_from_lng - from_point.lng) > _COORD_EPSILON
        ):
            from_point = PointUpdate(
                address=from_point.address,
                lat=next_from_lat,
                lng=next_from_lng,
            )

    if from_changed and from_point is not None:
        if actor == RouteChangeActor.DRIVER:
            if request.original_from_lat is None or request.original_from_lng is None:
                request.original_from_address = request.from_address
                request.original_from_lat = request.from_lat
                request.original_from_lng = request.from_lng
            request.pickup_changed_by_driver = True
            request.pickup_notified_at = None
            request.pickup_confirmed_at = None
            _bump_pickup_revision(request)
        else:
            _reset_pickup_confirmation_flags(request)
        request.from_address = from_point.address.strip()
        request.from_lat = from_point.lat
        request.from_lng = from_point.lng

    if to_changed and to_point is not None:
        request.to_address = to_point.address.strip()
        request.to_lat = to_point.lat
        request.to_lng = to_point.lng

    await db_session.commit()
    await db_session.refresh(request)

    changed: set[RoutePointKind] = set()
    if from_changed:
        changed.add("from")
    if to_changed:
        changed.add("to")
    return request, RouteChangeResult(changed=frozenset(changed)), None


async def mark_driver_pickup_notified(
    db_session: AsyncSession,
    *,
    request_id: str,
) -> None:
    request = await get_request(db_session, request_id=request_id)
    if request is None or not request.pickup_changed_by_driver:
        return
    request.pickup_notified_at = func.now()
    await db_session.commit()
    await db_session.refresh(request)


async def apply_route_update_with_notifications(
    db_session: AsyncSession,
    *,
    request_id: str,
    actor: RouteChangeActor,
    passenger_id: str | None = None,
    driver_id: str | None = None,
    from_point: PointUpdate | None = None,
    to_point: PointUpdate | None = None,
) -> tuple[RideRequest | None, str | None]:
    from app.services.driver_service import get_driver
    from app.services.ride_route_notification_service import notify_route_changed

    request, result, error = await update_ride_route_points(
        db_session,
        request_id=request_id,
        actor=actor,
        passenger_id=passenger_id,
        driver_id=driver_id,
        from_point=from_point,
        to_point=to_point,
    )
    if error is not None:
        return request, error
    if request is None or result is None or not result.changed:
        return request, None

    driver = None
    if request.driver_id:
        driver = await get_driver(db_session, driver_id=request.driver_id)
    await notify_route_changed(
        request=request,
        actor=actor,
        changed=result.changed,
        driver=driver,
    )
    if actor == RouteChangeActor.DRIVER and "from" in result.changed:
        await mark_driver_pickup_notified(db_session, request_id=request.id)
        request = await get_request(db_session, request_id=request.id)
    return request, None
