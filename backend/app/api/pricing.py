from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles, require_user_or_admin_session
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.pricing_service import get_or_create_pricing, ride_price_eur, update_pricing


router = APIRouter(prefix="/pricing")


class PricingOut(BaseModel):
    pointsPerRide: int
    pointPriceCents: int
    ridePriceEur: float
    workStartTime: str
    workEndTime: str
    slotIntervalMinutes: int


class PricingUpdate(BaseModel):
    pointsPerRide: int | None = Field(default=None, ge=1)
    pointPriceCents: int | None = Field(default=None, ge=1)
    workStartTime: str | None = Field(default=None, pattern=r'^\d{2}:\d{2}$')
    workEndTime: str | None = Field(default=None, pattern=r'^\d{2}:\d{2}$')
    slotIntervalMinutes: int | None = Field(default=None, ge=5, le=120)


def _to_pricing_out(pricing) -> PricingOut:
    return PricingOut(
        pointsPerRide=pricing.points_per_ride,
        pointPriceCents=pricing.point_price_cents,
        ridePriceEur=ride_price_eur(pricing.points_per_ride, pricing.point_price_cents),
        workStartTime=pricing.work_start_time,
        workEndTime=pricing.work_end_time,
        slotIntervalMinutes=pricing.slot_interval_minutes,
    )


@router.get("", response_model=PricingOut)
async def get_pricing(
    _=Depends(require_user_or_admin_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    pricing = await get_or_create_pricing(db_session)
    return _to_pricing_out(pricing)


@router.patch("", response_model=PricingOut)
async def patch_pricing(
    payload: PricingUpdate,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    pricing = await update_pricing(
        db_session,
        points_per_ride=payload.pointsPerRide,
        point_price_cents=payload.pointPriceCents,
        work_start_time=payload.workStartTime,
        work_end_time=payload.workEndTime,
        slot_interval_minutes=payload.slotIntervalMinutes,
    )
    return _to_pricing_out(pricing)
