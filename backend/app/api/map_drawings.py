from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.map_drawing_service import create_map_drawing, delete_map_drawing, list_map_drawings


router = APIRouter(prefix="/map-drawings")


class LatLng(BaseModel):
    lat: float
    lng: float


class MapDrawingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    color: str = Field(min_length=4, max_length=20)
    strokeWidth: int = Field(default=4, ge=1, le=16)
    points: list[LatLng] = Field(min_length=2)


class MapDrawingOut(BaseModel):
    id: str
    title: str
    color: str
    strokeWidth: int
    points: list[LatLng]
    createdByRole: str
    createdAt: datetime


class MapDrawingPage(BaseModel):
    items: list[MapDrawingOut]
    total: int
    limit: int
    offset: int


def _to_out(drawing) -> MapDrawingOut:
    return MapDrawingOut(
        id=drawing.id,
        title=drawing.title,
        color=drawing.color,
        strokeWidth=drawing.stroke_width,
        points=[LatLng(**point) for point in (drawing.points or [])],
        createdByRole=drawing.created_by_role,
        createdAt=drawing.created_at,
    )


@router.get("", response_model=MapDrawingPage)
async def list_drawings(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    drawings, total = await list_map_drawings(db_session, limit=limit, offset=offset)
    return MapDrawingPage(
        items=[_to_out(item) for item in drawings],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=MapDrawingOut)
async def create_drawing(
    payload: MapDrawingCreate,
    session=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    drawing = await create_map_drawing(
        db_session,
        title=payload.title.strip(),
        color=payload.color,
        stroke_width=payload.strokeWidth,
        points=[point.model_dump() for point in payload.points],
        created_by_role=session.role,
    )
    return _to_out(drawing)


@router.delete("/{drawing_id}")
async def delete_drawing(
    drawing_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    deleted = await delete_map_drawing(db_session, drawing_id=drawing_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Drawing not found.")
    return {"success": True}
