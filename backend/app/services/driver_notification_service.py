from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.i18n import t
from app.core.config import settings
from app.db import async_session_factory
from app.services.user_service import get_user_by_id


logger = logging.getLogger(__name__)


def _notifications_enabled() -> bool:
    token = settings.bot_token.strip()
    if not token:
        return False
    if token.startswith("test-"):
        return False
    return True


def _resolve_chat_id(user_id: str) -> int | None:
    try:
        return int(user_id)
    except (TypeError, ValueError):
        return None


async def _resolve_lang(user_id: str, *, fallback: str | None = None) -> str:
    async with async_session_factory() as db_session:
        user = await get_user_by_id(db_session, user_id=user_id)
        if user is not None:
            return user.preferred_language
    return fallback or "lt"


async def _send_to_user(
    *,
    user_id: str,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    if not _notifications_enabled():
        return
    chat_id = _resolve_chat_id(user_id)
    if chat_id is None:
        return
    try:
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
    except Exception:
        logger.exception("Failed to deliver driver Telegram notification.")


async def notify_driver_application_submitted(*, user_id: str, language: str | None) -> None:
    lang = language or await _resolve_lang(user_id)
    text = t("driver.application.submitted", lang)
    await _send_to_user(user_id=user_id, text=text)


async def notify_driver_application_approved(*, user_id: str, language: str | None, enter_url: str) -> None:
    lang = language or await _resolve_lang(user_id)
    template = t("driver.application.approved", lang)
    text = template.replace("{enter_url}", enter_url)
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text=t("driver.application.open_cabinet", lang),
                url=enter_url,
            )],
        ]
    )
    await _send_to_user(user_id=user_id, text=text, reply_markup=keyboard)


async def notify_driver_application_rejected(
    *,
    user_id: str,
    language: str | None,
    reason: str | None,
) -> None:
    lang = language or await _resolve_lang(user_id)
    template = t("driver.application.rejected", lang)
    reason_text = (reason or "").strip() or t("driver.application.rejected_no_reason", lang)
    text = template.replace("{reason}", reason_text)
    await _send_to_user(user_id=user_id, text=text)


async def notify_driver_offer_booked(
    *,
    offer,
    request,
    passenger_name: str,
) -> None:
    from app.services.driver_service import get_driver

    async with async_session_factory() as db_session:
        driver = await get_driver(db_session, driver_id=offer.driver_id)
    if driver is None or not driver.user_id:
        return
    lang = await _resolve_lang(driver.user_id)
    template = t("driver.offer.booked", lang)
    text = (
        template.replace("{passenger_name}", passenger_name)
        .replace("{from_address}", offer.from_address)
        .replace("{to_address}", offer.to_address)
        .replace("{date_time}", offer.date_time.strftime("%Y-%m-%d %H:%M UTC"))
        .replace("{seats_available}", str(offer.seats_available))
    )
    await _send_to_user(user_id=driver.user_id, text=text)


async def notify_driver_ride_assigned(*, request, driver) -> None:
    """Notify driver in Telegram when admin assigns a ride."""
    if driver is None or not driver.user_id:
        return
    from app.bot.datetime_format import format_bot_date, format_bot_time

    lang = await _resolve_lang(driver.user_id)
    template = t("driver.ride.assigned", lang)
    text = (
        template.replace("{ride_number}", str(request.ride_number))
        .replace("{passenger_name}", request.passenger_name)
        .replace("{from_address}", request.from_address)
        .replace("{to_address}", request.to_address)
        .replace("{date}", format_bot_date(request.date_time))
        .replace("{time}", format_bot_time(request.date_time))
    )
    await _send_to_user(user_id=driver.user_id, text=text)


def _esc(value: object) -> str:
    """Экранирование пользовательских данных для HTML-разметки Telegram."""
    import html

    return html.escape("" if value is None else str(value))


async def _driver_user_id(user_id: str | None, driver_id: str | None) -> str | None:
    if user_id:
        return user_id
    if not driver_id:
        return None
    from app.services.driver_service import get_driver

    async with async_session_factory() as db_session:
        driver = await get_driver(db_session, driver_id=driver_id)
    return driver.user_id if driver else None


async def notify_driver_ride_event(*, request, event: str, driver=None, extra: dict | None = None) -> None:
    """Событие поездки водителю в Telegram — те же ключи i18n, что и у in-app уведомления."""
    if not _notifications_enabled():
        return
    if driver is None and request.driver_id:
        from app.services.driver_service import get_driver

        async with async_session_factory() as db_session:
            driver = await get_driver(db_session, driver_id=request.driver_id)
    if driver is None or not driver.user_id:
        return

    from app.bot.datetime_format import format_bot_date, format_bot_time

    lang = await _resolve_lang(driver.user_id)
    values: dict = {
        "ride_number": request.ride_number,
        "passenger_name": request.passenger_name,
        "from_address": request.from_address,
        "to_address": request.to_address,
        "date": format_bot_date(request.date_time) if request.date_time else "",
        "time": format_bot_time(request.date_time) if request.date_time else "",
        "min_wait_minutes": _min_wait_minutes(),
    }
    if extra:
        values.update(extra)
    from app.services.ride_notification_service import decorate_event_values

    values = decorate_event_values(pool="driver", event=event, lang=lang, values=values, extra=extra)

    title = _esc(t(f"notif.ride.driver.{event}.title", lang))
    body = t(f"notif.ride.driver.{event}.body", lang)
    for name, value in values.items():
        body = body.replace("{" + name + "}", _esc(value))
    text = f"<b>{title}</b>\n\n{body}"

    button_text = t("driver.ride.open_cabinet", lang)
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=button_text, url=settings.telegram_mini_app_url)]]
    )
    await _send_to_user(user_id=driver.user_id, text=text, reply_markup=keyboard)


def _min_wait_minutes() -> int:
    from app.core.config import settings as app_settings

    return int(app_settings.ride_no_show_min_wait_minutes)


async def notify_driver_chat_message(*, request, sender_name: str, text: str) -> None:
    """Пересылает сообщение чата водителю в Telegram."""
    if not _notifications_enabled():
        return
    from app.services.driver_service import get_driver

    async with async_session_factory() as db_session:
        driver = await get_driver(db_session, driver_id=request.driver_id)
    if driver is None or not driver.user_id:
        return

    lang = await _resolve_lang(driver.user_id)
    title = _esc(t("notif.ride.chat.title", lang)).replace("{sender_name}", _esc(sender_name))
    body = t("notif.ride.chat.body", lang)
    body = body.replace("{sender_name}", _esc(sender_name)).replace("{text}", _esc(text))
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text=t("driver.ride.open_cabinet", lang),
                url=settings.telegram_mini_app_url,
            )
        ]]
    )
    await _send_to_user(
        user_id=driver.user_id,
        text=f"<b>{title}</b>\n\n{body}",
        reply_markup=keyboard,
    )
