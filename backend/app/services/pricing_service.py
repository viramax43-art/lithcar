from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pricing_settings import PricingSettings


DEFAULT_POINTS_PER_RIDE = 10
DEFAULT_POINT_PRICE_CENTS = 50
DEFAULT_USER_INFO_TEXT = ""
DEFAULT_WORK_START_TIME = "06:00"
DEFAULT_WORK_END_TIME = "19:00"
DEFAULT_SLOT_INTERVAL_MINUTES = 30


async def get_or_create_pricing(db_session: AsyncSession) -> PricingSettings:
    pricing = await db_session.get(PricingSettings, 1)
    if pricing is not None:
        return pricing

    pricing = PricingSettings(
        id=1,
        points_per_ride=DEFAULT_POINTS_PER_RIDE,
        point_price_cents=DEFAULT_POINT_PRICE_CENTS,
        user_info_text=DEFAULT_USER_INFO_TEXT,
        work_start_time=DEFAULT_WORK_START_TIME,
        work_end_time=DEFAULT_WORK_END_TIME,
        slot_interval_minutes=DEFAULT_SLOT_INTERVAL_MINUTES,
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
    user_info_text: str | None = None,
    work_start_time: str | None = None,
    work_end_time: str | None = None,
    slot_interval_minutes: int | None = None,
) -> PricingSettings:
    pricing = await get_or_create_pricing(db_session)
    if points_per_ride is not None:
        pricing.points_per_ride = points_per_ride
    if point_price_cents is not None:
        pricing.point_price_cents = point_price_cents
    if user_info_text is not None:
        pricing.user_info_text = user_info_text
    if work_start_time is not None:
        pricing.work_start_time = work_start_time
    if work_end_time is not None:
        pricing.work_end_time = work_end_time
    if slot_interval_minutes is not None:
        pricing.slot_interval_minutes = slot_interval_minutes
    await db_session.commit()
    await db_session.refresh(pricing)
    return pricing


def ride_price_eur(points_per_ride: int, point_price_cents: int) -> float:
    return round((points_per_ride * point_price_cents) / 100, 2)
