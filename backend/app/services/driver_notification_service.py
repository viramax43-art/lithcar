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
