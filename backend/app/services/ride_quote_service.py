from __future__ import annotations

import json
import math
from dataclasses import dataclass, field

from pydantic import BaseModel, Field

from app.models.pricing_settings import PricingSettings
from app.services.geo_service import RouteMetrics, haversine_km, osrm_route_metrics


PRICING_MODE_FIXED = "fixed"
PRICING_MODE_DYNAMIC = "dynamic"


class PricingFormulaTierV1(BaseModel):
    max_circuity: float = Field(alias="maxCircuity", ge=1.0)
    distance_multiplier: float = Field(alias="distanceMultiplier", ge=0.0)
    minute_multiplier: float = Field(alias="minuteMultiplier", ge=0.0)
    label: str = Field(min_length=1, max_length=64)

    model_config = {"populate_by_name": True}


class PricingFormulaV1(BaseModel):
    version: int = 1
    base_price_cents: int = Field(alias="basePriceCents", ge=0)
    price_per_km_cents: int = Field(alias="pricePerKmCents", ge=0)
    price_per_minute_cents: int = Field(alias="pricePerMinuteCents", ge=0)
    circuity_free_threshold: float = Field(alias="circuityFreeThreshold", ge=1.0)
    circuity_penalty_per_step_cents: int = Field(alias="circuityPenaltyPerStepCents", ge=0)
    min_price_cents: int = Field(alias="minPriceCents", ge=0)
    max_price_cents: int = Field(alias="maxPriceCents", ge=1)
    min_points: int = Field(alias="minPoints", ge=1)
    require_osrm: bool = Field(alias="requireOsrm", default=False)
    fallback_speed_kmh: float = Field(alias="fallbackSpeedKmh", gt=0)
    tiers: list[PricingFormulaTierV1] = Field(min_length=1)

    model_config = {"populate_by_name": True}


def default_pricing_formula() -> PricingFormulaV1:
    return PricingFormulaV1(
        basePriceCents=200,
        pricePerKmCents=12,
        pricePerMinuteCents=4,
        circuityFreeThreshold=1.10,
        circuityPenaltyPerStepCents=8,
        minPriceCents=300,
        maxPriceCents=2500,
        minPoints=1,
        requireOsrm=False,
        fallbackSpeedKmh=35.0,
        tiers=[
            PricingFormulaTierV1(
                maxCircuity=1.12,
                distanceMultiplier=1.0,
                minuteMultiplier=1.0,
                label="Прямой",
            ),
            PricingFormulaTierV1(
                maxCircuity=1.30,
                distanceMultiplier=1.15,
                minuteMultiplier=1.1,
                label="Смешанный",
            ),
            PricingFormulaTierV1(
                maxCircuity=999.0,
                distanceMultiplier=1.35,
                minuteMultiplier=1.25,
                label="Городской",
            ),
        ],
    )


def default_pricing_formula_json() -> dict:
    return default_pricing_formula().model_dump(by_alias=True)


def parse_pricing_formula(raw: dict | str | None) -> PricingFormulaV1:
    if raw is None:
        return default_pricing_formula()
    if isinstance(raw, str):
        data = json.loads(raw) if raw.strip() else {}
    else:
        data = raw
    if not data:
        return default_pricing_formula()
    return PricingFormulaV1.model_validate(data)


@dataclass(frozen=True)
class RouteQuoteMetrics:
    straight_km: float
    road_km: float
    duration_min: float
    circuity: float
    avg_speed_kmh: float
    tier_label: str
    osrm_used: bool


@dataclass
class QuoteBreakdownLine:
    key: str
    label: str
    amount_cents: int


@dataclass
class RideQuote:
    pricing_mode: str
    points: int
    price_cents: int
    price_eur: float
    metrics: RouteQuoteMetrics | None = None
    breakdown: list[QuoteBreakdownLine] = field(default_factory=list)


def select_tier(formula: PricingFormulaV1, circuity: float) -> PricingFormulaTierV1:
    sorted_tiers = sorted(formula.tiers, key=lambda t: t.max_circuity)
    for tier in sorted_tiers:
        if circuity <= tier.max_circuity:
            return tier
    return sorted_tiers[-1]


def apply_formula(
    formula: PricingFormulaV1,
    *,
    road_km: float,
    duration_min: float,
    circuity: float,
    point_price_cents: int,
) -> tuple[int, int, list[QuoteBreakdownLine]]:
    tier = select_tier(formula, circuity)

    base_cents = formula.base_price_cents
    distance_cents = round(
        road_km * formula.price_per_km_cents * tier.distance_multiplier
    )
    minute_cents = round(
        duration_min * formula.price_per_minute_cents * tier.minute_multiplier
    )
    circuity_excess = max(0.0, circuity - formula.circuity_free_threshold)
    circuity_cents = round(
        circuity_excess * formula.circuity_penalty_per_step_cents * road_km
    )

    subtotal = base_cents + distance_cents + minute_cents + circuity_cents
    final_cents = max(
        formula.min_price_cents,
        min(formula.max_price_cents, subtotal),
    )
    points = max(
        formula.min_points,
        math.ceil(final_cents / point_price_cents),
    )

    breakdown = [
        QuoteBreakdownLine("base", "Базовая ставка", base_cents),
        QuoteBreakdownLine(
            "distance",
            f"Расстояние ({road_km:.1f} км × tier {tier.label})",
            distance_cents,
        ),
        QuoteBreakdownLine(
            "duration",
            f"Время ({duration_min:.0f} мин × tier {tier.label})",
            minute_cents,
        ),
    ]
    if circuity_cents > 0:
        breakdown.append(
            QuoteBreakdownLine(
                "circuity",
                f"Извилистость ({circuity:.2f})",
                circuity_cents,
            )
        )
    if final_cents != subtotal:
        breakdown.append(
            QuoteBreakdownLine(
                "clamp",
                "Ограничение min/max",
                final_cents - subtotal,
            )
        )

    return points, final_cents, breakdown


def build_fixed_quote(pricing: PricingSettings) -> RideQuote:
    points = int(pricing.points_per_ride)
    price_cents = points * int(pricing.point_price_cents)
    return RideQuote(
        pricing_mode=PRICING_MODE_FIXED,
        points=points,
        price_cents=price_cents,
        price_eur=round(price_cents / 100, 2),
        breakdown=[
            QuoteBreakdownLine(
                "fixed",
                f"Фиксированная ставка ({points} pts)",
                price_cents,
            )
        ],
    )


async def compute_route_metrics(
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    formula: PricingFormulaV1,
) -> RouteQuoteMetrics:
    straight_km = haversine_km(from_lat, from_lng, to_lat, to_lng)
    straight_km = max(straight_km, 0.01)

    osrm_metrics: RouteMetrics | None = await osrm_route_metrics(
        from_lat, from_lng, to_lat, to_lng
    )

    if osrm_metrics is None:
        if formula.require_osrm:
            raise ValueError("OSRM is required for pricing but routing is unavailable.")
        road_km = straight_km
        duration_min = (road_km / formula.fallback_speed_kmh) * 60.0
        osrm_used = False
    else:
        road_km = osrm_metrics.road_km
        duration_min = osrm_metrics.duration_min
        osrm_used = True

    circuity = road_km / straight_km
    avg_speed_kmh = (road_km / (duration_min / 60.0)) if duration_min > 0 else 0.0
    tier = select_tier(formula, circuity)

    return RouteQuoteMetrics(
        straight_km=round(straight_km, 3),
        road_km=round(road_km, 3),
        duration_min=round(duration_min, 1),
        circuity=round(circuity, 3),
        avg_speed_kmh=round(avg_speed_kmh, 1),
        tier_label=tier.label,
        osrm_used=osrm_used,
    )


async def calculate_ride_quote(
    pricing: PricingSettings,
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
) -> RideQuote:
    mode = (pricing.pricing_mode or PRICING_MODE_FIXED).strip().lower()
    if mode != PRICING_MODE_DYNAMIC:
        return build_fixed_quote(pricing)

    formula = parse_pricing_formula(pricing.pricing_formula_json)
    metrics = await compute_route_metrics(
        from_lat=from_lat,
        from_lng=from_lng,
        to_lat=to_lat,
        to_lng=to_lng,
        formula=formula,
    )
    points, price_cents, breakdown = apply_formula(
        formula,
        road_km=metrics.road_km,
        duration_min=metrics.duration_min,
        circuity=metrics.circuity,
        point_price_cents=int(pricing.point_price_cents),
    )
    return RideQuote(
        pricing_mode=PRICING_MODE_DYNAMIC,
        points=points,
        price_cents=price_cents,
        price_eur=round(price_cents / 100, 2),
        metrics=metrics,
        breakdown=breakdown,
    )
