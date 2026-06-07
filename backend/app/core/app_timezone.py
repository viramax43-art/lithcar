from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

APP_TIMEZONE = ZoneInfo("Europe/Vilnius")
MIN_BOOKING_LEAD_HOURS = 5


def normalize_app_datetime(value: datetime) -> datetime:
    """Naive datetimes are interpreted as Europe/Vilnius local wall clock."""
    if value.tzinfo is None:
        return value.replace(tzinfo=APP_TIMEZONE).astimezone(timezone.utc)
    return value.astimezone(timezone.utc)


def to_app_local(value: datetime) -> datetime:
    normalized = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return normalized.astimezone(APP_TIMEZONE)
