from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.ride_booking_service import (
    InvalidRideDateTimeError,
    validate_ride_datetime,
)
from tests.ride_datetime import APP_TZ, future_ride_datetime


def test_same_day_booking_without_lead_time():
    """A ride later today is accepted; the old 5-hour lead time is gone."""
    ride_time = future_ride_datetime(hours_ahead=1)
    assert validate_ride_datetime(ride_time) == ride_time
    assert ride_time > datetime.now(timezone.utc)


def test_slots_align_to_midnight_grid():
    ride_time = future_ride_datetime(hours_ahead=2, slot_interval_minutes=30)
    local = ride_time.astimezone(APP_TZ)
    assert (local.hour * 60 + local.minute) % 30 == 0


def test_unaligned_time_is_rejected():
    unaligned = future_ride_datetime(hours_ahead=2) + timedelta(minutes=7)
    with pytest.raises(InvalidRideDateTimeError):
        validate_ride_datetime(unaligned)


def test_past_time_is_rejected():
    with pytest.raises(InvalidRideDateTimeError):
        validate_ride_datetime(datetime.now(timezone.utc) - timedelta(minutes=30))


def test_late_evening_slot_is_bookable():
    """The old working-hours window (06:00-19:00) no longer applies."""
    slot = datetime.now(timezone.utc).astimezone(APP_TZ).replace(
        hour=23, minute=0, second=0, microsecond=0
    )
    if slot <= datetime.now(timezone.utc):
        slot = slot + timedelta(days=1)
    validated = validate_ride_datetime(slot)
    assert validated.astimezone(APP_TZ).hour == 23


def test_booking_window_is_limited_to_two_days():
    too_far = (datetime.now(timezone.utc) + timedelta(days=3)).astimezone(APP_TZ)
    aligned = too_far.replace(minute=0, second=0, microsecond=0)
    with pytest.raises(InvalidRideDateTimeError):
        validate_ride_datetime(aligned)
