from datetime import datetime, timezone

from app.bot.datetime_format import format_bot_date, format_bot_date_time_html, format_bot_time


def test_format_bot_date_time_uses_vilnius():
    value = datetime(2026, 1, 15, 6, 30, tzinfo=timezone.utc)
    assert format_bot_date(value) == "15.01.2026"
    assert format_bot_time(value) == "08:30"


def test_format_bot_date_time_html_is_bold_and_multiline():
    value = datetime(2026, 1, 15, 6, 30, tzinfo=timezone.utc)
    html = format_bot_date_time_html(value, "ru")
    assert "<b>15.01.2026</b>" in html
    assert "<b>08:30</b>" in html
    assert "Дата" in html
    assert "Время" in html
