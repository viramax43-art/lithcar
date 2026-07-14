from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_zone import ServiceZone
from app.services.geo_service import point_in_polygon, haversine_km


class PickupOutOfZoneError(Exception):
    code = "pickup_out_of_zone"

    def __init__(self, message: str = "Pickup point is outside active service zones."):
        super().__init__(message)
        self.message = message


async def create_zone(
    db_session: AsyncSession,
    *,
    name: str,
    color: str,
    polygon: list[dict[str, float]],
    is_active: bool = True,
) -> ServiceZone:
    zone = ServiceZone(name=name, color=color, polygon=polygon, is_active=is_active)
    db_session.add(zone)
    await db_session.commit()
    await db_session.refresh(zone)
    return zone


async def list_zones(
    db_session: AsyncSession,
    *,
    limit: int,
    offset: int,
) -> tuple[list[ServiceZone], int]:
    total_query = await db_session.execute(select(func.count()).select_from(ServiceZone))
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(
        select(ServiceZone).order_by(ServiceZone.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def get_zone(db_session: AsyncSession, *, zone_id: str) -> ServiceZone | None:
    return await db_session.get(ServiceZone, zone_id)


async def update_zone(
    db_session: AsyncSession,
    *,
    zone_id: str,
    name: str | None = None,
    color: str | None = None,
    polygon: list[dict[str, float]] | None = None,
    is_active: bool | None = None,
) -> ServiceZone | None:
    zone = await get_zone(db_session, zone_id=zone_id)
    if zone is None:
        return None
    if name is not None:
        zone.name = name
    if color is not None:
        zone.color = color
    if polygon is not None:
        zone.polygon = polygon
    if is_active is not None:
        zone.is_active = is_active
    await db_session.commit()
    await db_session.refresh(zone)
    return zone


async def delete_zone(db_session: AsyncSession, *, zone_id: str) -> bool:
    zone = await get_zone(db_session, zone_id=zone_id)
    if zone is None:
        return False
    await db_session.delete(zone)
    await db_session.commit()
    return True


async def is_pickup_in_active_zone(
    db_session: AsyncSession, *, lat: float, lng: float
) -> bool:
    result = await db_session.execute(select(ServiceZone).where(ServiceZone.is_active.is_(True)))
    zones = list(result.scalars().all())
    if not zones:
        return True
    return any(point_in_polygon(lat, lng, zone.polygon or []) for zone in zones)


async def is_point_in_any_active_zone(
    db_session: AsyncSession, *, lat: float, lng: float
) -> bool:
    """Backward-compatible alias for pickup zone checks."""
    return await is_pickup_in_active_zone(db_session, lat=lat, lng=lng)


async def snap_pickup_coordinates(
    db_session: AsyncSession, *, lat: float, lng: float
) -> tuple[float, float]:
    result = await db_session.execute(select(ServiceZone).where(ServiceZone.is_active.is_(True)))
    zones = list(result.scalars().all())
    if not zones:
        return lat, lng
    if any(point_in_polygon(lat, lng, zone.polygon or []) for zone in zones):
        return lat, lng

    best_centroid: tuple[float, float] | None = None
    best_distance_km = float("inf")
    for zone in zones:
        polygon = zone.polygon or []
        if len(polygon) < 3:
            continue
        centroid_lat = sum(float(point["lat"]) for point in polygon) / len(polygon)
        centroid_lng = sum(float(point["lng"]) for point in polygon) / len(polygon)
        distance_km = haversine_km(lat, lng, centroid_lat, centroid_lng)
        if distance_km < best_distance_km:
            best_distance_km = distance_km
            best_centroid = (centroid_lat, centroid_lng)

    if best_centroid is None:
        return lat, lng
    return best_centroid


async def assert_pickup_in_active_zone(
    db_session: AsyncSession, *, lat: float, lng: float
) -> None:
    if not await is_pickup_in_active_zone(db_session, lat=lat, lng=lng):
        raise PickupOutOfZoneError()
