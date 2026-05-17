from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles, require_user_or_admin_session
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.zone_service import create_zone, delete_zone, list_zones, update_zone


router = APIRouter(prefix="/service-zones")


class LatLng(BaseModel):
    lat: float
    lng: float


class ServiceZoneCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = Field(min_length=1)
    polygon: list[LatLng] = Field(min_length=3)
    isActive: bool = True


class ServiceZoneUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    polygon: list[LatLng] | None = None
    isActive: bool | None = None


class ServiceZoneOut(BaseModel):
    id: str
    name: str
    color: str
    polygon: list[LatLng]
    isActive: bool
    createdAt: datetime


class ServiceZonePage(BaseModel):
    items: list[ServiceZoneOut]
    total: int
    limit: int
    offset: int


def _to_zone_out(zone) -> ServiceZoneOut:
    return ServiceZoneOut(
        id=zone.id,
        name=zone.name,
        color=zone.color,
        polygon=[LatLng(**point) for point in (zone.polygon or [])],
        isActive=zone.is_active,
        createdAt=zone.created_at,
    )


@router.get("", response_model=ServiceZonePage)
async def list_service_zones(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_user_or_admin_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    zones, total = await list_zones(db_session, limit=limit, offset=offset)
    return ServiceZonePage(
        items=[_to_zone_out(zone) for zone in zones],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ServiceZoneOut)
async def create_service_zone(
    payload: ServiceZoneCreate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    zone = await create_zone(
        db_session,
        name=payload.name,
        color=payload.color,
        polygon=[point.model_dump() for point in payload.polygon],
        is_active=payload.isActive,
    )
    return _to_zone_out(zone)


@router.patch("/{zone_id}", response_model=ServiceZoneOut)
async def update_service_zone(
    zone_id: str,
    payload: ServiceZoneUpdate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    zone = await update_zone(
        db_session,
        zone_id=zone_id,
        name=payload.name,
        color=payload.color,
        polygon=None if payload.polygon is None else [point.model_dump() for point in payload.polygon],
        is_active=payload.isActive,
    )
    if zone is None:
        raise HTTPException(status_code=404, detail="Service zone not found.")
    return _to_zone_out(zone)


@router.delete("/{zone_id}")
async def delete_service_zone(
    zone_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    deleted = await delete_zone(db_session, zone_id=zone_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Service zone not found.")
    return {"success": True}
