from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.api.auth import require_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.user import UserRole
from app.services.map_mark_service import create_map_mark, delete_map_mark, list_map_marks
from app.services.storage_service import download_mark_photo, upload_mark_photo


router = APIRouter(prefix="/map-marks")

MapMarkVisibility = Literal["admin_only", "public"]


class LatLng(BaseModel):
    lat: float
    lng: float


class MapMarkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    position: LatLng
    visibility: MapMarkVisibility = "admin_only"
    photoKey: str | None = None


class MapMarkOut(BaseModel):
    id: str
    title: str
    position: LatLng
    visibility: MapMarkVisibility
    photoKey: str | None = None
    photoUrl: str | None = None
    createdByRole: str
    createdAt: datetime


class MapMarkPage(BaseModel):
    items: list[MapMarkOut]
    total: int
    limit: int
    offset: int


class MapMarkPhotoUploadOut(BaseModel):
    photoKey: str
    photoUrl: str


def _to_out(mark) -> MapMarkOut:
    photo_url = None
    if mark.photo_key:
        photo_url = f"/api/map-marks/photos/{quote(mark.photo_key, safe='/')}"
    return MapMarkOut(
        id=mark.id,
        title=mark.title,
        position=LatLng(lat=mark.lat, lng=mark.lng),
        visibility=mark.visibility,
        photoKey=mark.photo_key,
        photoUrl=photo_url,
        createdByRole=mark.created_by_role,
        createdAt=mark.created_at,
    )


@router.post("/photo", response_model=MapMarkPhotoUploadOut)
async def upload_map_mark_photo_endpoint(
    file: UploadFile = File(...),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size must be <= 10MB.")
    key = upload_mark_photo(
        filename=file.filename or "map-mark-photo",
        content_type=file.content_type,
        content=content,
    )
    return MapMarkPhotoUploadOut(photoKey=key, photoUrl=f"/api/map-marks/photos/{quote(key, safe='/')}")


@router.get("/photos/{object_key:path}")
async def get_map_mark_photo(object_key: str):
    try:
        body, content_type = download_mark_photo(object_key=object_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Photo not found.") from exc
    return Response(content=body, media_type=content_type)


@router.get("", response_model=MapMarkPage)
async def list_admin_marks(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    marks, total = await list_map_marks(db_session, limit=limit, offset=offset)
    return MapMarkPage(items=[_to_out(item) for item in marks], total=total, limit=limit, offset=offset)


@router.get("/public", response_model=MapMarkPage)
async def list_public_marks(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_roles(UserRole.PASSENGER, UserRole.ADMIN, UserRole.MODERATOR, UserRole.DRIVER)),
    db_session: AsyncSession = Depends(get_db_session),
):
    marks, total = await list_map_marks(
        db_session,
        limit=limit,
        offset=offset,
        visibility="public",
    )
    return MapMarkPage(items=[_to_out(item) for item in marks], total=total, limit=limit, offset=offset)


@router.post("", response_model=MapMarkOut)
async def create_mark(
    payload: MapMarkCreate,
    session=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    normalized_title = payload.title.strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="Mark title is required.")
    mark = await create_map_mark(
        db_session,
        title=normalized_title,
        lat=payload.position.lat,
        lng=payload.position.lng,
        visibility=payload.visibility,
        photo_key=payload.photoKey,
        created_by_role=session.role,
    )
    return _to_out(mark)


@router.delete("/{mark_id}")
async def delete_mark(
    mark_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    deleted = await delete_map_mark(db_session, mark_id=mark_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mark not found.")
    return {"success": True}
