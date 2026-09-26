from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

APP_TZ = ZoneInfo("Europe/Vilnius")
MIN_BOOKING_LEAD_HOURS = 0


def _from_local_components(day: datetime, total_minutes: int) -> datetime:
    hour = total_minutes // 60
    minute = total_minutes % 60
    local = day.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=APP_TZ)
    return local.astimezone(timezone.utc)


def future_ride_datetime(
    *,
    hours_ahead: float = MIN_BOOKING_LEAD_HOURS + 1,
    minutes_offset: int = 0,
    work_start: str = "06:00",
    work_end: str = "19:00",
    slot_interval_minutes: int = 30,
) -> datetime:
    """Return a UTC datetime valid for ride booking tests (Europe/Vilnius wall clock).

    Booking is available around the clock and slots are aligned to the interval
    counted from local midnight, mirroring the production validator.
    ``work_start``/``work_end`` are kept for backward compatibility and ignored.
    """
    del work_start, work_end
    interval = max(1, slot_interval_minutes)

    now_utc = datetime.now(timezone.utc)
    # The extra minute keeps the slot in the future even when the API call
    # happens moments after this helper returned.
    target = now_utc + timedelta(hours=hours_ahead, minutes=minutes_offset + 1)
    local = target.astimezone(APP_TZ).replace(second=0, microsecond=0)

    total_minutes = local.hour * 60 + local.minute
    remainder = total_minutes % interval
    if remainder:
        total_minutes += interval - remainder

    day = local
    if total_minutes >= 24 * 60:
        total_minutes -= 24 * 60
        day = local + timedelta(days=1)

    candidate = _from_local_components(day, total_minutes)
    min_allowed = now_utc + timedelta(minutes=1)
    while candidate < min_allowed:
        total_minutes += interval
        if total_minutes >= 24 * 60:
            total_minutes -= 24 * 60
            day = day + timedelta(days=1)
        candidate = _from_local_components(day, total_minutes)

    return candidate


def future_ride_datetime_iso(*, hours_ahead: float = MIN_BOOKING_LEAD_HOURS + 1, minutes_offset: int = 0) -> str:
    return future_ride_datetime(hours_ahead=hours_ahead, minutes_offset=minutes_offset).isoformat()
