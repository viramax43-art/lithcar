from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ride_request import RideRequest, RideRequestStatus
from app.services.geo_service import get_distance_matrix_km, haversine_km
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
    quoted_points: int | None = None,
    quoted_price_cents: int | None = None,
    quote_road_km: float | None = None,
    quote_straight_km: float | None = None,
    quote_circuity: float | None = None,
    quote_duration_min: float | None = None,
    quote_tier_label: str | None = None,
    quote_breakdown_json: list[dict] | None = None,
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
        quoted_points=quoted_points,
        quoted_price_cents=quoted_price_cents,
        quote_road_km=quote_road_km,
        quote_straight_km=quote_straight_km,
        quote_circuity=quote_circuity,
        quote_duration_min=quote_duration_min,
        quote_tier_label=quote_tier_label,
        quote_breakdown_json=quote_breakdown_json,
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


async def _compute_route_order(requests: list[RideRequest]) -> list[RideRequest]:
    """Nearest-neighbor heuristic using OSRM road distances (haversine fallback)."""
    if len(requests) <= 1:
        return list(requests)
    # Build distance matrix for all pickup points + a virtual centroid start
    avg_lat = sum(r.from_lat for r in requests) / len(requests)
    avg_lng = sum(r.from_lng for r in requests) / len(requests)
    # points[0] = centroid, points[1..N] = pickup locations
    points: list[tuple[float, float]] = [(avg_lat, avg_lng)]
    for r in requests:
        points.append((r.from_lat, r.from_lng))
    matrix = await get_distance_matrix_km(points)
    # Nearest-neighbor starting from centroid (index 0)
    remaining = list(range(1, len(points)))  # indices 1..N
    ordered: list[RideRequest] = []
    current_idx = 0
    while remaining:
        best_idx_in_remaining = 0
        best_dist = float("inf")
        for ri, point_idx in enumerate(remaining):
            dist = matrix[current_idx][point_idx]
            if dist < best_dist:
                best_dist = dist
                best_idx_in_remaining = ri
        chosen_point_idx = remaining.pop(best_idx_in_remaining)
        ordered.append(requests[chosen_point_idx - 1])  # -1 because centroid is at index 0
        current_idx = chosen_point_idx
    return ordered


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
    # Compute optimized route order using OSRM road distances
    if len(requests) > 1:
        ordered = await _compute_route_order(requests)
        for idx, req in enumerate(ordered):
            req.route_order = idx + 1
    elif len(requests) == 1:
        requests[0].route_order = 1
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


_DRIVER_POINT_ACTION_TARGET_STATUS: dict[tuple[str, str], str] = {
    ("pickup", "start"): RideRequestStatus.EN_ROUTE_TO_PICKUP,
    ("pickup", "arrived"): RideRequestStatus.AWAITING_PASSENGER,
    ("pickup", "complete"): RideRequestStatus.IN_PROGRESS,
    ("dropoff", "start"): RideRequestStatus.IN_PROGRESS,
    ("dropoff", "arrived"): RideRequestStatus.COMPLETED,
    ("dropoff", "complete"): RideRequestStatus.COMPLETED,
}


async def apply_driver_point_action(
    db_session: AsyncSession,
    *,
    request_id: str,
    driver_id: str,
    point_type: str,
    action: str,
) -> tuple[RideRequest | None, str | None, str | None]:
    """Apply a point action from the driver app.

    Returns: (request, previous_status, error_message)
    """
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, None, "Поездка не найдена."
    if request.driver_id != driver_id:
        return None, None, "Эта поездка не назначена вам."

    key = (point_type, action)
    target_status = _DRIVER_POINT_ACTION_TARGET_STATUS.get(key)
    if target_status is None:
        return request, request.status, "Неизвестное действие по точке."

    previous_status = request.status
    if target_status == previous_status:
        return request, previous_status, None
    if not RideRequestStatus.can_driver_transition(previous_status, target_status):
        return request, previous_status, (
            f"Невозможное действие для текущего статуса: {previous_status} → {target_status}."
        )

    request.status = target_status
    await db_session.commit()
    await db_session.refresh(request)
    return request, previous_status, None


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
    if request.original_from_lat is None or request.original_from_lng is None:
        request.original_from_address = request.from_address
        request.original_from_lat = request.from_lat
        request.original_from_lng = request.from_lng
    request.from_address = from_address
    request.from_lat = from_lat
    request.from_lng = from_lng
    request.pickup_changed_by_driver = True
    request.pickup_notified_at = None
    request.pickup_confirmed_at = None
    await db_session.commit()
    await db_session.refresh(request)
    return request, None


async def reset_driver_pickup_point(
    db_session: AsyncSession,
    *,
    request_id: str,
    driver_id: str,
) -> tuple[RideRequest | None, str | None]:
    """Driver resets edited pickup point back to the original one."""
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, "Поездка не найдена."
    if request.driver_id != driver_id:
        return None, "Эта поездка не назначена вам."
    if request.status not in (RideRequestStatus.ASSIGNED, RideRequestStatus.EN_ROUTE_TO_PICKUP):
        return None, "Нельзя изменить точку подачи в текущем статусе."
    if (
        request.original_from_address is None
        or request.original_from_lat is None
        or request.original_from_lng is None
    ):
        return None, "Исходная точка подачи не найдена."

    request.from_address = request.original_from_address
    request.from_lat = request.original_from_lat
    request.from_lng = request.original_from_lng
    request.pickup_changed_by_driver = False
    request.pickup_notified_at = None
    request.pickup_confirmed_at = None
    request.original_from_address = None
    request.original_from_lat = None
    request.original_from_lng = None
    await db_session.commit()
    await db_session.refresh(request)
    return request, None


async def mark_pickup_notified(
    db_session: AsyncSession,
    *,
    request_id: str,
    driver_id: str,
) -> tuple[RideRequest | None, str | None]:
    """Driver confirms the pickup change — marks it ready to notify the passenger."""
    request = await get_request(db_session, request_id=request_id)
    if request is None:
        return None, "Поездка не найдена."
    if request.driver_id != driver_id:
        return None, "Эта поездка не назначена вам."
    if not request.pickup_changed_by_driver:
        return None, "Точка подачи не была изменена."
    if request.pickup_notified_at is not None:
        return None, "Пассажир уже уведомлён."
    request.pickup_notified_at = func.now()
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
