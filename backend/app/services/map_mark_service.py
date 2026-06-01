from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.map_mark import MapMark


async def create_map_mark(
    db_session: AsyncSession,
    *,
    title: str,
    lat: float,
    lng: float,
    visibility: str,
    photo_key: str | None,
    created_by_role: str,
) -> MapMark:
    mark = MapMark(
        title=title,
        lat=lat,
        lng=lng,
        visibility=visibility,
        photo_key=photo_key,
        created_by_role=created_by_role,
    )
    db_session.add(mark)
    await db_session.commit()
    await db_session.refresh(mark)
    return mark


async def list_map_marks(
    db_session: AsyncSession,
    *,
    limit: int,
    offset: int,
    visibility: str | None = None,
) -> tuple[list[MapMark], int]:
    total_query = select(func.count()).select_from(MapMark)
    query = select(MapMark)
    if visibility is not None:
        total_query = total_query.where(MapMark.visibility == visibility)
        query = query.where(MapMark.visibility == visibility)
    total_result = await db_session.execute(total_query)
    total = int(total_result.scalar_one() or 0)
    query = query.order_by(MapMark.created_at.desc()).limit(limit).offset(offset)
    result = await db_session.execute(query)
    return list(result.scalars().all()), total


async def delete_map_mark(db_session: AsyncSession, *, mark_id: str) -> bool:
    mark = await db_session.get(MapMark, mark_id)
    if mark is None:
        return False
    await db_session.delete(mark)
    await db_session.commit()
    return True
