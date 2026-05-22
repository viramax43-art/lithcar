from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.driver_service import (
    create_driver,
    delete_driver,
    get_driver,
    is_driver_online,
    list_drivers,
    rotate_driver_key,
    update_driver_profile,
    update_driver_location,
    update_driver_online,
)
from app.services.storage_service import download_driver_photo, upload_driver_photo


router = APIRouter(prefix="/drivers")


class LatLng(BaseModel):
    lat: float
    lng: float


class DriverCreate(BaseModel):
    userId: str | None = None
    name: str = Field(min_length=1)
    photoKey: str | None = None
    carBrand: str = Field(min_length=1)
    carModel: str = Field(min_length=1)
    carPlate: str = Field(min_length=1)
    vehicleColor: str = Field(min_length=1)
    seatsCount: int = Field(default=4, ge=1, le=12)
    licenseNumber: str = ""
    about: str = ""
    rating: float = 5.0
    isOnline: bool = False
    canSellPoints: bool = False


class DriverOnlineUpdate(BaseModel):
    isOnline: bool


class DriverLocationUpdate(BaseModel):
    currentLocation: LatLng


class DriverUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    photoKey: str | None = None
    carBrand: str | None = Field(default=None, min_length=1)
    carModel: str | None = Field(default=None, min_length=1)
    carPlate: str | None = Field(default=None, min_length=1)
    vehicleColor: str | None = Field(default=None, min_length=1)
    seatsCount: int | None = Field(default=None, ge=1, le=12)
    about: str | None = None
    rating: float | None = Field(default=None, ge=0.0, le=5.0)
    isOnline: bool | None = None
    canSellPoints: bool | None = None


class DriverOut(BaseModel):
    id: str
    userId: str | None
    name: str
    photoUrl: str | None
    carBrand: str
    carModel: str
    carPlate: str
    vehicleColor: str
    seatsCount: int
    licenseNumber: str
    about: str
    canSellPoints: bool
    keyPrefix: str
    rating: float
    isOnline: bool
    currentLocation: LatLng | None = None
    createdAt: datetime


class DriverCreateResult(BaseModel):
    driver: DriverOut
    key: str


class DriverPage(BaseModel):
    items: list[DriverOut]
    total: int
    limit: int
    offset: int


class DriverPhotoUploadOut(BaseModel):
    photoKey: str
    photoUrl: str


def _to_driver_out(driver) -> DriverOut:
    effective_online = is_driver_online(
        driver,
        online_timeout_seconds=settings.driver_online_ttl_seconds,
    )
    location = None
    if effective_online and driver.current_lat is not None and driver.current_lng is not None:
        location = LatLng(lat=driver.current_lat, lng=driver.current_lng)
    photo_url = None
    if driver.photo_url:
        photo_url = f"/api/drivers/photos/{quote(driver.photo_url, safe='/')}"
    return DriverOut(
        id=driver.id,
        userId=driver.user_id,
        name=driver.name,
        photoUrl=photo_url,
        carBrand=driver.car_brand,
        carModel=driver.car_model,
        carPlate=driver.car_plate,
        vehicleColor=driver.vehicle_color,
        seatsCount=driver.seats_count,
        licenseNumber=driver.license_number,
        about=driver.about,
        canSellPoints=driver.can_sell_points,
        keyPrefix=driver.key_prefix or "",
        rating=driver.rating,
        isOnline=effective_online,
        currentLocation=location,
        createdAt=driver.created_at,
    )


@router.post("/photo", response_model=DriverPhotoUploadOut)
async def upload_driver_photo_endpoint(
    file: UploadFile = File(...),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size must be <= 10MB.")
    key = upload_driver_photo(
        filename=file.filename or "driver-photo",
        content_type=file.content_type,
        content=content,
    )
    return DriverPhotoUploadOut(photoKey=key, photoUrl=f"/api/drivers/photos/{quote(key, safe='/')}")


@router.get("/photos/{object_key:path}")
async def get_driver_photo(object_key: str):
    try:
        body, content_type = download_driver_photo(object_key=object_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Photo not found.") from exc
    return Response(content=body, media_type=content_type)


@router.get("", response_model=DriverPage)
async def get_drivers(
    onlineOnly: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    drivers, total = await list_drivers(
        db_session,
        online_only=onlineOnly,
        online_timeout_seconds=settings.driver_online_ttl_seconds,
        limit=limit,
        offset=offset,
    )
    return DriverPage(
        items=[_to_driver_out(driver) for driver in drivers],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=DriverCreateResult)
async def create_driver_endpoint(
    payload: DriverCreate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await create_driver(
        db_session,
        user_id=payload.userId,
        name=payload.name,
        photo_url=payload.photoKey,
        car_brand=payload.carBrand,
        car_model=payload.carModel,
        car_plate=payload.carPlate,
        vehicle_color=payload.vehicleColor,
        seats_count=payload.seatsCount,
        license_number=payload.licenseNumber,
        about=payload.about,
        rating=payload.rating,
        is_online=payload.isOnline,
        can_sell_points=payload.canSellPoints,
    )
    return DriverCreateResult(driver=_to_driver_out(driver), key=getattr(driver, "_raw_key", ""))


@router.patch("/{driver_id}", response_model=DriverOut)
async def update_driver_endpoint(
    driver_id: str,
    payload: DriverUpdate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await update_driver_profile(
        db_session,
        driver_id=driver_id,
        name=payload.name,
        photo_url=payload.photoKey,
        car_brand=payload.carBrand,
        car_model=payload.carModel,
        car_plate=payload.carPlate,
        vehicle_color=payload.vehicleColor,
        seats_count=payload.seatsCount,
        about=payload.about,
        rating=payload.rating,
        is_online=payload.isOnline,
        can_sell_points=payload.canSellPoints,
    )
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return _to_driver_out(driver)


@router.delete("/{driver_id}")
async def delete_driver_endpoint(
    driver_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    deleted = await delete_driver(db_session, driver_id=driver_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return {"success": True}


@router.post("/{driver_id}/rotate-key", response_model=DriverCreateResult)
async def rotate_driver_key_endpoint(
    driver_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    rotated = await rotate_driver_key(db_session, driver_id=driver_id)
    if rotated is None:
        raise HTTPException(status_code=404, detail="Driver not found.")
    driver, plaintext = rotated
    return DriverCreateResult(driver=_to_driver_out(driver), key=plaintext)


@router.patch("/{driver_id}/online", response_model=DriverOut)
async def update_driver_online_endpoint(
    driver_id: str,
    payload: DriverOnlineUpdate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await update_driver_online(db_session, driver_id=driver_id, is_online=payload.isOnline)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return _to_driver_out(driver)


@router.patch("/{driver_id}/location", response_model=DriverOut)
async def update_driver_location_endpoint(
    driver_id: str,
    payload: DriverLocationUpdate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await update_driver_location(
        db_session,
        driver_id=driver_id,
        lat=payload.currentLocation.lat,
        lng=payload.currentLocation.lng,
    )
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return _to_driver_out(driver)
