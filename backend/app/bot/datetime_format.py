from __future__ import annotations

import html
from datetime import datetime

from app.bot.i18n import t
from app.core.app_timezone import to_app_local


def format_bot_date(value: datetime) -> str:
    return to_app_local(value).strftime("%d.%m.%Y")


def format_bot_time(value: datetime) -> str:
    return to_app_local(value).strftime("%H:%M")


def format_bot_date_time_html(value: datetime, lang: str) -> str:
    """Date and time on separate lines, bold (Telegram HTML)."""
    date_label = html.escape(t("notif.date", lang))
    time_label = html.escape(t("notif.time", lang))
    date_value = html.escape(format_bot_date(value))
    time_value = html.escape(format_bot_time(value))
    return (
        f"📅 {date_label}:\n<b>{date_value}</b>\n"
        f"🕐 {time_label}:\n<b>{time_value}</b>"
    )
