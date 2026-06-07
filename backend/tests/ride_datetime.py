from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

APP_TZ = ZoneInfo("Europe/Vilnius")
MIN_BOOKING_LEAD_HOURS = 5


def _parse_hhmm(value: str) -> int:
    hour, minute = (int(part) for part in value.split(":"))
    return hour * 60 + minute


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
    """Return a UTC datetime valid for ride booking tests (Europe/Vilnius wall clock)."""
    now_utc = datetime.now(timezone.utc)
    min_utc = now_utc + timedelta(hours=max(hours_ahead, MIN_BOOKING_LEAD_HOURS), minutes=minutes_offset)
    local = min_utc.astimezone(APP_TZ)

    start_total = _parse_hhmm(work_start)
    end_total = _parse_hhmm(work_end)
    interval = max(1, slot_interval_minutes)

    total_minutes = local.hour * 60 + local.minute
    if total_minutes < start_total or total_minutes > end_total:
        local = local.replace(hour=start_total // 60, minute=start_total % 60, second=0, microsecond=0)
        total_minutes = start_total

    remainder = (total_minutes - start_total) % interval
    if remainder:
        total_minutes += interval - remainder
        local = local.replace(hour=total_minutes // 60, minute=total_minutes % 60, second=0, microsecond=0)

    if total_minutes > end_total:
        next_day = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        local = next_day.replace(hour=start_total // 60, minute=start_total % 60)
        total_minutes = start_total

    candidate = local.astimezone(timezone.utc)
    min_allowed = now_utc + timedelta(hours=MIN_BOOKING_LEAD_HOURS)
    while candidate < min_allowed:
        total_minutes = local.hour * 60 + local.minute + interval
        if total_minutes > end_total:
            next_day = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            local = next_day.replace(hour=start_total // 60, minute=start_total % 60)
        else:
            local = local.replace(hour=total_minutes // 60, minute=total_minutes % 60, second=0, microsecond=0)
        candidate = local.astimezone(timezone.utc)

    return candidate


def future_ride_datetime_iso(*, hours_ahead: float = MIN_BOOKING_LEAD_HOURS + 1, minutes_offset: int = 0) -> str:
    return future_ride_datetime(hours_ahead=hours_ahead, minutes_offset=minutes_offset).isoformat()
