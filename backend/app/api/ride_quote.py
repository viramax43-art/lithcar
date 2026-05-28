from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_user_or_admin_session
from app.core.dependencies import get_db_session
from app.services.pricing_service import get_or_create_pricing
from app.services.ride_quote_service import calculate_ride_quote


router = APIRouter(prefix="/ride-quote")


class QuoteBreakdownLineOut(BaseModel):
    key: str
    label: str
    amountCents: int


class QuoteMetricsOut(BaseModel):
    straightKm: float
    roadKm: float
    durationMin: float
    circuity: float
    avgSpeedKmh: float
    tierLabel: str
    osrmUsed: bool


class RideQuoteOut(BaseModel):
    pricingMode: str
    points: int
    priceCents: int
    priceEur: float
    metrics: QuoteMetricsOut | None = None
    breakdown: list[QuoteBreakdownLineOut] = Field(default_factory=list)


def _quote_to_out(quote) -> RideQuoteOut:
    metrics_out = None
    if quote.metrics is not None:
        m = quote.metrics
        metrics_out = QuoteMetricsOut(
            straightKm=m.straight_km,
            roadKm=m.road_km,
            durationMin=m.duration_min,
            circuity=m.circuity,
            avgSpeedKmh=m.avg_speed_kmh,
            tierLabel=m.tier_label,
            osrmUsed=m.osrm_used,
        )
    return RideQuoteOut(
        pricingMode=quote.pricing_mode,
        points=quote.points,
        priceCents=quote.price_cents,
        priceEur=quote.price_eur,
        metrics=metrics_out,
        breakdown=[
            QuoteBreakdownLineOut(key=line.key, label=line.label, amountCents=line.amount_cents)
            for line in quote.breakdown
        ],
    )


@router.get("", response_model=RideQuoteOut)
async def get_ride_quote(
    from_lat: float = Query(alias="fromLat"),
    from_lng: float = Query(alias="fromLng"),
    to_lat: float = Query(alias="toLat"),
    to_lng: float = Query(alias="toLng"),
    _=Depends(require_user_or_admin_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    pricing = await get_or_create_pricing(db_session)
    try:
        quote = await calculate_ride_quote(
            pricing,
            from_lat=from_lat,
            from_lng=from_lng,
            to_lat=to_lat,
            to_lng=to_lng,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return _quote_to_out(quote)
