from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.platform_settings_service import (
    get_platform_config,
    normalize_platform_config,
    update_platform_config,
)
from app.services.ride_request_service import purge_completed_history

router = APIRouter(prefix="/admin/platform-settings", tags=["Admin Platform Settings"])


class PlatformSettingsPatch(BaseModel):
    passenger: dict[str, Any] | None = None
    driver: dict[str, Any] | None = None
    system: dict[str, Any] | None = None
    promotions: dict[str, Any] | None = None

    model_config = {"extra": "forbid"}


class PlatformSettingsOut(BaseModel):
    passenger: dict[str, Any]
    driver: dict[str, Any]
    system: dict[str, Any]
    promotions: dict[str, Any]


@router.get("", response_model=PlatformSettingsOut)
async def get_settings(
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    cfg = await get_platform_config(db_session)
    return PlatformSettingsOut(**cfg)


@router.patch("", response_model=PlatformSettingsOut)
async def patch_settings(
    payload: PlatformSettingsPatch,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    cfg = await update_platform_config(db_session, patch)
    return PlatformSettingsOut(**normalize_platform_config(cfg))


system_router = APIRouter(prefix="/admin/system", tags=["Admin System"])


class PurgeHistoryRequest(BaseModel):
    days: int | None = Field(default=None, ge=0, description="Override retention days; omit to use config")


class PurgeHistoryOut(BaseModel):
    deleted: int


@system_router.post("/purge-history", response_model=PurgeHistoryOut)
async def purge_history_endpoint(
    payload: PurgeHistoryRequest,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    days = payload.days
    if days is None:
        cfg = await get_platform_config(db_session)
        days = int(cfg.get("system", {}).get("historyRetentionDays", 0) or 0)
    deleted = await purge_completed_history(db_session, days=days)
    return PurgeHistoryOut(deleted=deleted)
