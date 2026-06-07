from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _parse_hhmm(value: str) -> int:
    hour, minute = (int(part) for part in value.split(":"))
    return hour * 60 + minute


def _from_total_minutes(day: datetime, total_minutes: int) -> datetime:
    hour = total_minutes // 60
    minute = total_minutes % 60
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def future_ride_datetime(
    *,
    hours_ahead: float = 2,
    minutes_offset: int = 0,
    work_start: str = "06:00",
    work_end: str = "19:00",
    slot_interval_minutes: int = 30,
) -> datetime:
    """Return a UTC datetime valid for ride booking tests."""
    now = datetime.now(timezone.utc)
    candidate = now + timedelta(hours=hours_ahead, minutes=minutes_offset)

    start_total = _parse_hhmm(work_start)
    end_total = _parse_hhmm(end)
    interval = max(1, slot_interval_minutes)

    total_minutes = candidate.hour * 60 + candidate.minute
    if total_minutes < start_total or total_minutes > end_total:
        candidate = _from_total_minutes(candidate, start_total)
        total_minutes = start_total

    remainder = (total_minutes - start_total) % interval
    if remainder:
        total_minutes += interval - remainder
        candidate = _from_total_minutes(candidate, total_minutes)

    if total_minutes > end_total:
        next_day = (candidate + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        candidate = _from_total_minutes(next_day, start_total)

    while candidate <= now:
        total_minutes = candidate.hour * 60 + candidate.minute + interval
        if total_minutes > end_total:
            next_day = (candidate + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            candidate = _from_total_minutes(next_day, start_total)
        else:
            candidate = _from_total_minutes(candidate, total_minutes)

    return candidate


def future_ride_datetime_iso(*, hours_ahead: float = 2, minutes_offset: int = 0) -> str:
    return future_ride_datetime(hours_ahead=hours_ahead, minutes_offset=minutes_offset).isoformat()
