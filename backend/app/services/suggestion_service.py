from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ride_request import RideRequest, RideRequestStatus
from app.services.geo_service import haversine_km
from app.services.ride_request_service import list_requests


async def build_group_suggestions(db_session: AsyncSession) -> list[dict]:
    # Загружаем заявки батчами, чтобы поддерживать новый пагинированный контракт.
    requests = []
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
    suggestions: list[dict] = []
    used_ids: set[str] = set()
    group_index = 1

    for i, first in enumerate(candidates):
        if first.id in used_ids:
            continue
        for second in candidates[i + 1 :]:
            if second.id in used_ids:
                continue
            similarity = _similarity_score(first, second)
            if similarity < 60:
                continue
            group_id = f"grp-{group_index}"
            group_index += 1
            suggestions.append(
                {
                    "id": group_id,
                    "requestIds": [first.id, second.id],
                    "similarity": similarity,
                    "reason": _build_reason(first, second, similarity),
                }
            )
            used_ids.add(first.id)
            used_ids.add(second.id)
            break
    return suggestions


def _similarity_score(first: RideRequest, second: RideRequest) -> int:
    from_distance = haversine_km(first.from_lat, first.from_lng, second.from_lat, second.from_lng)
    to_distance = haversine_km(first.to_lat, first.to_lng, second.to_lat, second.to_lng)
    time_minutes = abs((first.date_time - second.date_time).total_seconds()) / 60.0

    distance_factor = max(0.0, 1 - ((from_distance + to_distance) / 8))
    time_factor = max(0.0, 1 - (time_minutes / 120))
    score = int(round((distance_factor * 0.65 + time_factor * 0.35) * 100))
    return max(0, min(score, 100))


def _build_reason(first: RideRequest, second: RideRequest, similarity: int) -> str:
    time_delta_minutes = int(abs((first.date_time - second.date_time).total_seconds()) // 60)
    return (
        f"Маршруты близки и время отличается на {time_delta_minutes} мин. "
        f"Оценка совпадения: {similarity}%."
    )
