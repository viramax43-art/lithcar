from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ride_request import RideRequest, RideRequestStatus
from app.services.geo_service import get_distance_matrix_km, haversine_km
from app.services.ride_request_service import list_requests

logger = logging.getLogger(__name__)


async def build_group_suggestions(db_session: AsyncSession) -> list[dict]:
    requests: list[RideRequest] = []
    offset = 0
    batch_size = 500
    while True:
        page_items, total = await list_requests(
            db_session,
            limit=batch_size,
            offset=offset,
        )
        requests.extend(page_items)
        offset += len(page_items)
        if offset >= total or not page_items:
            break
    candidates = [
        request
        for request in requests
        if request.status in {RideRequestStatus.PENDING, RideRequestStatus.GROUPED, RideRequestStatus.ASSIGNED}
    ]
    if len(candidates) < 2:
        return []

    # Build distance matrix via OSRM for all candidate from/to points.
    # Layout: [from_0, to_0, from_1, to_1, ...]
    points: list[tuple[float, float]] = []
    for c in candidates:
        points.append((c.from_lat, c.from_lng))
        points.append((c.to_lat, c.to_lng))

    matrix = await get_distance_matrix_km(points)

    suggestions: list[dict] = []
    used_ids: set[str] = set()
    group_index = 1

    for i, first in enumerate(candidates):
        if first.id in used_ids:
            continue
        for j, second in enumerate(candidates[i + 1:], start=i + 1):
            if second.id in used_ids:
                continue
            # from_i is at matrix index i*2, to_i at i*2+1
            from_dist = matrix[i * 2][j * 2]      # distance between pickups
            to_dist = matrix[i * 2 + 1][j * 2 + 1]  # distance between dropoffs
            similarity = _similarity_score_from_distances(from_dist, to_dist, first, second)
            if similarity < 60:
                continue
            group_id = f"grp-{group_index}"
            group_index += 1
            suggestions.append(
                {
                    "id": group_id,
                    "requestIds": [first.id, second.id],
                    "similarity": similarity,
                    "reason": _build_reason(first, second, similarity, from_dist, to_dist),
                }
            )
            used_ids.add(first.id)
            used_ids.add(second.id)
            break
    return suggestions


def _similarity_score_from_distances(
    from_distance_km: float,
    to_distance_km: float,
    first: RideRequest,
    second: RideRequest,
) -> int:
    """Compute similarity using pre-computed road distances."""
    time_minutes = abs((first.date_time - second.date_time).total_seconds()) / 60.0

    distance_factor = max(0.0, 1 - ((from_distance_km + to_distance_km) / 10))
    time_factor = max(0.0, 1 - (time_minutes / 120))
    score = int(round((distance_factor * 0.65 + time_factor * 0.35) * 100))
    return max(0, min(score, 100))


def _build_reason(
    first: RideRequest,
    second: RideRequest,
    similarity: int,
    from_dist: float,
    to_dist: float,
) -> str:
    time_delta_minutes = int(abs((first.date_time - second.date_time).total_seconds()) // 60)
    return (
        f"Маршруты рядом по дороге ({from_dist:.1f} + {to_dist:.1f} км), "
        f"время отличается на {time_delta_minutes} мин. "
        f"Совпадение: {similarity}%."
    )
