from __future__ import annotations

import logging
import math
from typing import Sequence

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def point_in_polygon(lat: float, lng: float, polygon: list[dict[str, float]]) -> bool:
    inside = False
    n = len(polygon)
    if n < 3:
        return False

    j = n - 1
    for i in range(n):
        yi = float(polygon[i]["lat"])
        xi = float(polygon[i]["lng"])
        yj = float(polygon[j]["lat"])
        xj = float(polygon[j]["lng"])
        intersects = ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


# ---------------------------------------------------------------------------
# OSRM helpers — road-distance matrix with haversine fallback
# ---------------------------------------------------------------------------


async def osrm_distance_matrix_km(
    points: Sequence[tuple[float, float]],
) -> list[list[float]] | None:
    """Call OSRM /table to get a road-distance matrix (km).

    *points* is a list of (lat, lng) tuples.
    Returns NxN matrix of road distances in km, or ``None`` on failure.
    """
    if len(points) < 2:
        return None
    coords = ";".join(f"{lng},{lat}" for lat, lng in points)
    url = f"{settings.osrm_base_url}/table/v1/driving/{coords}?annotations=distance"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
        if data.get("code") != "Ok":
            logger.warning("OSRM table returned non-Ok code: %s", data.get("code"))
            return None
        raw = data["distances"]  # metres
        return [[cell / 1000.0 for cell in row] for row in raw]
    except Exception:
        logger.warning("OSRM table request failed, falling back to haversine", exc_info=True)
        return None


async def osrm_route_distance_km(
    lat1: float, lng1: float, lat2: float, lng2: float,
) -> float | None:
    """Get road distance between two points via OSRM /route (km).

    Returns ``None`` on failure so caller can fall back to haversine.
    """
    coords = f"{lng1},{lat1};{lng2},{lat2}"
    url = f"{settings.osrm_base_url}/route/v1/driving/{coords}?overview=false"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            return None
        return data["routes"][0]["distance"] / 1000.0
    except Exception:
        logger.warning("OSRM route request failed", exc_info=True)
        return None


def haversine_distance_matrix_km(
    points: Sequence[tuple[float, float]],
) -> list[list[float]]:
    """Build NxN haversine distance matrix as a fallback."""
    n = len(points)
    matrix: list[list[float]] = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine_km(points[i][0], points[i][1], points[j][0], points[j][1])
            matrix[i][j] = d
            matrix[j][i] = d
    return matrix


async def get_distance_matrix_km(
    points: Sequence[tuple[float, float]],
) -> list[list[float]]:
    """Get distance matrix — tries OSRM first, falls back to haversine."""
    osrm = await osrm_distance_matrix_km(points)
    if osrm is not None:
        return osrm
    return haversine_distance_matrix_km(points)
