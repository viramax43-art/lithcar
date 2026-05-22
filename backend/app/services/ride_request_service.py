from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ride_request import RideRequest, RideRequestStatus
from app.services.zone_service import is_point_in_any_active_zone


async def create_ride_request_record(
    db_session: AsyncSession,
    *,
    passenger_id: str,
    passenger_name: str,
    from_address: str,
    from_lat: float,
    from_lng: float,
    to_address: str,
    to_lat: float,
    to_lng: float,
    date_time: datetime,
) -> RideRequest:
    is_from_allowed = await is_point_in_any_active_zone(db_session, lat=from_lat, lng=from_lng)
    is_to_allowed = await is_point_in_any_active_zone(db_session, lat=to_lat, lng=to_lng)
    if not is_from_allowed or not is_to_allowed:
        raise ValueError("Route points are outside active service zones.")

    request = RideRequest(
        passenger_id=passenger_id,
        passenger_name=passenger_name,
        from_address=from_address,
        from_lat=from_lat,
        from_lng=from_lng,
        to_address=to_address,
        to_lat=to_lat,
        to_lng=to_lng,
        date_time=date_time,
        status=RideRequestStatus.PENDING,
    )
    db_session.add(request)
    await db_session.flush()
    return request


async def create_ride_request(
    db_session: AsyncSession,
    *,
    passenger_id: str,
    passenger_name: str,
    from_address: str,
    from_lat: float,
    from_lng: float,
    to_address: str,
    to_lat: float,
    to_lng: float,
    date_time: datetime,
) -> RideRequest:
    request = await create_ride_request_record(
        db_session,
        passenger_id=passenger_id,
        passenger_name=passenger_name,
        from_address=from_address,
        from_lat=from_lat,
        from_lng=from_lng,
        to_address=to_address,
        to_lat=to_lat,
        to_lng=to_lng,
        date_time=date_time,
    )
    await db_session.commit()
    await db_session.refresh(request)
    return request


async def list_passenger_requests(
    db_session: AsyncSession,
    *,
    passenger_id: str,
    limit: int,
    offset: int,
) -> tuple[list[RideRequest], int]:
    total_query = await db_session.execute(
        select(func.count()).select_from(RideRequest).where(RideRequest.passenger_id == passenger_id)
    )
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(
        select(RideRequest)
        .where(RideRequest.passenger_id == passenger_id)
        .order_by(RideRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), total


async def list_requests(
    db_session: AsyncSession, *, status: str | None = None, limit: int, offset: int
) -> tuple[list[RideRequest], int]:
    total_stmt = select(func.count()).select_from(RideRequest)
    stmt = select(RideRequest).order_by(RideRequest.created_at.desc()).limit(limit).offset(offset)
    if status:
        stmt = stmt.where(RideRequest.status == status)
        total_stmt = total_stmt.where(RideRequest.status == status)
    total_query = await db_session.execute(total_stmt)
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(stmt)
    return list(result.scalars().all()), total


async def get_request(db_session: AsyncSession, *, request_id: str) -> RideRequest | None:
    return await db_session.get(RideRequest, request_id)


async def list_driver_requests(
    db_session: AsyncSession,
    *,
    driver_id: str,
    limit: int,
    offset: int,
) -> tuple[list[RideRequest], int]:
    total_query = await db_session.execute(
        select(func.count()).select_from(RideRequest).where(RideRequest.driver_id == driver_id)
    )
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(
        select(RideRequest)
        .where(RideRequest.driver_id == driver_id)
        .order_by(RideRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), total


async def assign_driver(
    db_session: AsyncSession,
    *,
    request_ids: list[str],
    driver_id: str,
    point_overrides: dict[str, dict] | None = None,
) -> list[RideRequest]:
    if not request_ids:
        return []
    result = await db_session.execute(
        select(RideRequest).where(RideRequest.id.in_(request_ids))
    )
    requests = list(result.scalars().all())
    overrides = point_overrides or {}
    for request in requests:
        override = overrides.get(request.id)
        if override:
            from_point = override.get("from")
            to_point = override.get("to")
            if from_point:
                next_from_lat = from_point["latlng"]["lat"]
                next_from_lng = from_point["latlng"]["lng"]
                if not await is_point_in_any_active_zone(
                    db_session, lat=next_from_lat, lng=next_from_lng
                ):
                    raise ValueError(
                        f"Точка подачи заявки {request.id} вне активных зон обслуживания."
                    )
                request.from_address = from_point["address"]
                request.from_lat = next_from_lat
                request.from_lng = next_from_lng
            if to_point:
                next_to_lat = to_point["latlng"]["lat"]
                next_to_lng = to_point["latlng"]["lng"]
                if not await is_point_in_any_active_zone(
                    db_session, lat=next_to_lat, lng=next_to_lng
                ):
                    raise ValueError(
                        f"Конечная точка заявки {request.id} вне активных зон обслуживания."
                    )
                request.to_address = to_point["address"]
                request.to_lat = next_to_lat
                request.to_lng = next_to_lng
        request.driver_id = driver_id
        request.status = RideRequestStatus.ASSIGNED
    await db_session.commit()
    for request in requests:
        await db_session.refresh(request)
    return requests


async def update_request_status(
    db_session: AsyncSession, *, request_id: str, status: str
) -> RideRequest | None:
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None
    request.status = status
    await db_session.commit()
    await db_session.refresh(request)
    return request


async def update_driver_ride_status(
    db_session: AsyncSession,
    *,
    request_id: str,
    driver_id: str,
    target_status: str,
) -> tuple[RideRequest | None, str | None]:
    """Update ride status from driver-side with strict transition validation.

    Returns (request, error_message). request is None if not found or not owned.
    """
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, "Поездка не найдена."
    if request.driver_id != driver_id:
        return None, "Эта поездка не назначена вам."
    if not RideRequestStatus.can_driver_transition(request.status, target_status):
        return request, (
            f"Невозможный переход статуса: {request.status} → {target_status}."
        )
    request.status = target_status
    await db_session.commit()
    await db_session.refresh(request)
    return request, None


async def update_ride_request(
    db_session: AsyncSession,
    *,
    request_id: str,
    passenger_name: str | None = None,
    from_address: str | None = None,
    from_lat: float | None = None,
    from_lng: float | None = None,
    to_address: str | None = None,
    to_lat: float | None = None,
    to_lng: float | None = None,
    date_time: datetime | None = None,
) -> RideRequest | None:
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None

    next_from_lat = from_lat if from_lat is not None else request.from_lat
    next_from_lng = from_lng if from_lng is not None else request.from_lng
    next_to_lat = to_lat if to_lat is not None else request.to_lat
    next_to_lng = to_lng if to_lng is not None else request.to_lng
    is_from_allowed = await is_point_in_any_active_zone(db_session, lat=next_from_lat, lng=next_from_lng)
    is_to_allowed = await is_point_in_any_active_zone(db_session, lat=next_to_lat, lng=next_to_lng)
    if not is_from_allowed or not is_to_allowed:
        raise ValueError("Route points are outside active service zones.")

    if passenger_name is not None:
        request.passenger_name = passenger_name
    if from_address is not None:
        request.from_address = from_address
    if from_lat is not None:
        request.from_lat = from_lat
    if from_lng is not None:
        request.from_lng = from_lng
    if to_address is not None:
        request.to_address = to_address
    if to_lat is not None:
        request.to_lat = to_lat
    if to_lng is not None:
        request.to_lng = to_lng
    if date_time is not None:
        request.date_time = date_time
    await db_session.commit()
    await db_session.refresh(request)
    return request


async def update_driver_pickup_point(
    db_session: AsyncSession,
    *,
    request_id: str,
    driver_id: str,
    from_address: str,
    from_lat: float,
    from_lng: float,
) -> tuple[RideRequest | None, str | None]:
    """Driver edits the pickup point for a ride assigned to them."""
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, "Поездка не найдена."
    if request.driver_id != driver_id:
        return None, "Эта поездка не назначена вам."
    if request.status not in (RideRequestStatus.ASSIGNED, RideRequestStatus.EN_ROUTE_TO_PICKUP):
        return None, "Нельзя изменить точку подачи в текущем статусе."
    if not await is_point_in_any_active_zone(db_session, lat=from_lat, lng=from_lng):
        return None, "Точка подачи вне активных зон обслуживания."
    request.from_address = from_address
    request.from_lat = from_lat
    request.from_lng = from_lng
    request.pickup_changed_by_driver = True
    request.pickup_confirmed_at = None
    await db_session.commit()
    await db_session.refresh(request)
    return request, None


async def confirm_pickup_point(
    db_session: AsyncSession,
    *,
    request_id: str,
    passenger_id: str,
) -> tuple[RideRequest | None, str | None]:
    """Passenger confirms they've seen the updated pickup point."""
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, "Поездка не найдена."
    if request.passenger_id != passenger_id:
        return None, "Эта поездка не принадлежит вам."
    request.pickup_confirmed_at = func.now()
    await db_session.commit()
    await db_session.refresh(request)
    return request, None


async def delete_ride_request(db_session: AsyncSession, *, request_id: str) -> bool:
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return False
    await db_session.delete(request)
    await db_session.commit()
    return True
