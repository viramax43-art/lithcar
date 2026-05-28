from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles, require_user_or_admin_session
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.pricing_service import get_or_create_pricing, ride_price_eur, update_pricing
from app.services.ride_quote_service import PRICING_MODE_DYNAMIC, PRICING_MODE_FIXED, PricingFormulaV1


router = APIRouter(prefix="/pricing")

VALID_PRICING_MODES = {PRICING_MODE_FIXED, PRICING_MODE_DYNAMIC}


class PricingFormulaTierOut(BaseModel):
    maxCircuity: float
    distanceMultiplier: float
    minuteMultiplier: float
    label: str


class PricingFormulaOut(BaseModel):
    version: int
    basePriceCents: int
    pricePerKmCents: int
    pricePerMinuteCents: int
    circuityFreeThreshold: float
    circuityPenaltyPerStepCents: int
    minPriceCents: int
    maxPriceCents: int
    minPoints: int
    requireOsrm: bool
    fallbackSpeedKmh: float
    tiers: list[PricingFormulaTierOut]


class PricingOut(BaseModel):
    pointsPerRide: int
    pointPriceCents: int
    ridePriceEur: float
    pricingMode: str
    pricingFormula: PricingFormulaOut
    userInfoText: str
    workStartTime: str
    workEndTime: str
    slotIntervalMinutes: int


class PricingUpdate(BaseModel):
    pointsPerRide: int | None = Field(default=None, ge=1)
    pointPriceCents: int | None = Field(default=None, ge=1)
    pricingMode: str | None = None
    pricingFormula: PricingFormulaV1 | None = Field(default=None, alias="pricingFormula")
    userInfoText: str | None = None
    workStartTime: str | None = Field(default=None, pattern=r'^\d{2}:\d{2}$')
    workEndTime: str | None = Field(default=None, pattern=r'^\d{2}:\d{2}$')
    slotIntervalMinutes: int | None = Field(default=None, ge=5, le=120)

    model_config = {"populate_by_name": True}


def _formula_to_out(formula: PricingFormulaV1) -> PricingFormulaOut:
    return PricingFormulaOut(
        version=formula.version,
        basePriceCents=formula.base_price_cents,
        pricePerKmCents=formula.price_per_km_cents,
        pricePerMinuteCents=formula.price_per_minute_cents,
        circuityFreeThreshold=formula.circuity_free_threshold,
        circuityPenaltyPerStepCents=formula.circuity_penalty_per_step_cents,
        minPriceCents=formula.min_price_cents,
        maxPriceCents=formula.max_price_cents,
        minPoints=formula.min_points,
        requireOsrm=formula.require_osrm,
        fallbackSpeedKmh=formula.fallback_speed_kmh,
        tiers=[
            PricingFormulaTierOut(
                maxCircuity=tier.max_circuity,
                distanceMultiplier=tier.distance_multiplier,
                minuteMultiplier=tier.minute_multiplier,
                label=tier.label,
            )
            for tier in formula.tiers
        ],
    )


def _to_pricing_out(pricing) -> PricingOut:
    from app.services.ride_quote_service import parse_pricing_formula

    formula = parse_pricing_formula(pricing.pricing_formula_json)
    return PricingOut(
        pointsPerRide=pricing.points_per_ride,
        pointPriceCents=pricing.point_price_cents,
        ridePriceEur=ride_price_eur(pricing.points_per_ride, pricing.point_price_cents),
        pricingMode=(pricing.pricing_mode or PRICING_MODE_FIXED),
        pricingFormula=_formula_to_out(formula),
        userInfoText=pricing.user_info_text or "",
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
    if payload.pricingMode is not None and payload.pricingMode not in VALID_PRICING_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"pricingMode must be one of: {', '.join(sorted(VALID_PRICING_MODES))}",
        )

    formula_dict: dict[str, Any] | None = None
    if payload.pricingFormula is not None:
        formula_dict = payload.pricingFormula.model_dump(by_alias=True)

    pricing = await update_pricing(
        db_session,
        points_per_ride=payload.pointsPerRide,
        point_price_cents=payload.pointPriceCents,
        pricing_mode=payload.pricingMode,
        pricing_formula_json=formula_dict,
        user_info_text=payload.userInfoText,
        work_start_time=payload.workStartTime,
        work_end_time=payload.workEndTime,
        slot_interval_minutes=payload.slotIntervalMinutes,
    )
    return _to_pricing_out(pricing)
