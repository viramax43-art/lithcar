from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.geo_service import haversine_km
from app.services.platform_settings_service import (
    get_platform_config,
    min_ride_distance_km,
)

RIDE_DISTANCE_TOO_SHORT_CODE = "ride_distance_too_short"
_DISTANCE_EPSILON_KM = 1e-9


class RideDistanceTooShortError(Exception):
    """Raised when point B is closer to point A than the configured minimum."""

    def __init__(self, *, distance_km: float, min_distance_km: float) -> None:
        self.distance_km = distance_km
        self.min_distance_km = min_distance_km
        super().__init__(
            f"Distance between points A and B is {distance_km:.2f} km; "
            f"minimum is {min_distance_km:g} km."
        )

    def as_http_detail(self) -> dict[str, Any]:
        return {
            "code": RIDE_DISTANCE_TOO_SHORT_CODE,
            "message": str(self),
            "distanceKm": round(self.distance_km, 3),
            "minDistanceKm": round(self.min_distance_km, 3),
        }


def ensure_ride_distance_allowed(
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    min_distance_km: float,
) -> float:
    """Return the A→B distance or raise when it is below the configured minimum."""
    distance_km = haversine_km(from_lat, from_lng, to_lat, to_lng)
    if min_distance_km > 0 and distance_km + _DISTANCE_EPSILON_KM < min_distance_km:
        raise RideDistanceTooShortError(
            distance_km=distance_km,
            min_distance_km=min_distance_km,
        )
    return distance_km


async def get_configured_min_ride_distance_km(db_session: AsyncSession) -> float:
    return min_ride_distance_km(await get_platform_config(db_session))


async def ensure_ride_distance_allowed_for_session(
    db_session: AsyncSession,
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
) -> float:
    return ensure_ride_distance_allowed(
        from_lat=from_lat,
        from_lng=from_lng,
        to_lat=to_lat,
        to_lng=to_lng,
        min_distance_km=await get_configured_min_ride_distance_km(db_session),
    )
