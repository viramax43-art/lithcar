from datetime import datetime, timezone

from app.core.app_timezone import normalize_app_datetime, to_app_local_iso


def test_to_app_local_iso_from_utc():
    value = datetime(2026, 1, 15, 6, 30, tzinfo=timezone.utc)
    assert to_app_local_iso(value) == "2026-01-15T09:30"


def test_normalize_app_datetime_treats_naive_as_vilnius():
    naive = datetime(2026, 1, 15, 6, 30)
    normalized = normalize_app_datetime(naive)
    assert normalized.hour == 3
    assert normalized.minute == 30
