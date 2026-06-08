from __future__ import annotations

from datetime import date, time, timezone
from zoneinfo import ZoneInfo
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.bot.handlers.booking import (
    combine_booking_datetime,
    duplicate_submit,
    get_selected_datetime,
    parse_manual_date,
    parse_manual_time,
    reject_non_location_from,
    resolve_quick_time,
)


def test_parse_manual_date():
    assert parse_manual_date("21.05.2026") == date(2026, 5, 21)
    assert parse_manual_date("2026-05-21") is None


def test_parse_manual_time():
    assert parse_manual_time("19:30") == time(19, 30)
    assert parse_manual_time("24:01") is None


def test_combine_and_restore_selected_datetime():
    combined = combine_booking_datetime(ride_date=date(2026, 5, 21), ride_time=time(12, 45))
    local = combined.astimezone(ZoneInfo("Europe/Vilnius"))
    assert local.hour == 12
    assert local.minute == 45
    assert combined.tzinfo == timezone.utc
    restored = get_selected_datetime({"ride_date": "2026-05-21", "ride_time": "12:45:00"})
    restored_local = restored.astimezone(ZoneInfo("Europe/Vilnius"))
    assert restored_local.hour == 12
    assert restored_local.minute == 45


def test_resolve_quick_time_returns_time_value():
    value = resolve_quick_time(ride_date=date.today(), minutes=30)
    assert isinstance(value, time)


@patch("app.bot.handlers.booking._get_user_lang", new_callable=AsyncMock, return_value="en")
async def test_reject_non_location_message(_mock_lang):
    message = SimpleNamespace(
        from_user=SimpleNamespace(id=1001, username="tester"),
        answer=AsyncMock(),
    )
    await reject_non_location_from(message)
    assert message.answer.await_count == 1


@patch("app.bot.handlers.booking._get_user_lang", new_callable=AsyncMock, return_value="en")
async def test_duplicate_submit_callback(_mock_lang):
    callback = SimpleNamespace(
        from_user=SimpleNamespace(id=1001, username="tester"),
        answer=AsyncMock(),
    )
    await duplicate_submit(callback)
    callback.answer.assert_awaited_once()
