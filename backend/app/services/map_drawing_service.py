from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.map_drawing import MapDrawing


async def create_map_drawing(
    db_session: AsyncSession,
    *,
    title: str,
    color: str,
    stroke_width: int,
    points: list[dict[str, float]],
    created_by_role: str,
) -> MapDrawing:
    drawing = MapDrawing(
        title=title,
        color=color,
        stroke_width=stroke_width,
        points=points,
        created_by_role=created_by_role,
    )
    db_session.add(drawing)
    await db_session.commit()
    await db_session.refresh(drawing)
    return drawing


async def list_map_drawings(
    db_session: AsyncSession,
    *,
    limit: int,
    offset: int,
) -> tuple[list[MapDrawing], int]:
    total_query = await db_session.execute(select(func.count()).select_from(MapDrawing))
    total = int(total_query.scalar_one() or 0)
    query = select(MapDrawing).order_by(MapDrawing.created_at.desc()).limit(limit).offset(offset)
    result = await db_session.execute(query)
    return list(result.scalars().all()), total


async def delete_map_drawing(db_session: AsyncSession, *, drawing_id: str) -> bool:
    drawing = await db_session.get(MapDrawing, drawing_id)
    if drawing is None:
        return False
    await db_session.delete(drawing)
    await db_session.commit()
    return True
