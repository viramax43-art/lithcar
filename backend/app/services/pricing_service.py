from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pricing_settings import PricingSettings


DEFAULT_POINTS_PER_RIDE = 10
DEFAULT_POINT_PRICE_CENTS = 50


async def get_or_create_pricing(db_session: AsyncSession) -> PricingSettings:
    pricing = await db_session.get(PricingSettings, 1)
    if pricing is not None:
        return pricing

    pricing = PricingSettings(
        id=1,
        points_per_ride=DEFAULT_POINTS_PER_RIDE,
        point_price_cents=DEFAULT_POINT_PRICE_CENTS,
    )
    db_session.add(pricing)
    await db_session.commit()
    await db_session.refresh(pricing)
    return pricing


async def update_pricing(
    db_session: AsyncSession,
    *,
    points_per_ride: int | None,
    point_price_cents: int | None,
) -> PricingSettings:
    pricing = await get_or_create_pricing(db_session)
    if points_per_ride is not None:
        pricing.points_per_ride = points_per_ride
    if point_price_cents is not None:
        pricing.point_price_cents = point_price_cents
    await db_session.commit()
    await db_session.refresh(pricing)
    return pricing


def ride_price_eur(points_per_ride: int, point_price_cents: int) -> float:
    return round((points_per_ride * point_price_cents) / 100, 2)
