from __future__ import annotations

import logging
from datetime import timezone

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.i18n import t
from app.core.config import settings
from app.db import async_session_factory
from app.models.driver import Driver
from app.models.ride_request import RideRequest
from app.services.user_service import get_user_by_id


logger = logging.getLogger(__name__)


def _notifications_enabled() -> bool:
    token = settings.bot_token.strip()
    if not token:
        return False
    # Тестовая среда подставляет фиктивный токен — в этом случае сетевые вызовы не нужны.
    if token.startswith("test-"):
        return False
    return True


def _resolve_chat_id(passenger_id: str) -> int | None:
    try:
        return int(passenger_id)
    except (TypeError, ValueError):
        return None


def _driver_card(driver: Driver) -> str:
    car = " ".join(p for p in [driver.car_brand, driver.car_model] if p).strip() or "Car"
    lines = [
        f"👤 {driver.name}",
        f"🚗 {car}, {driver.car_plate}",
    ]
    if driver.vehicle_color:
        lines.append(f"🎨 {driver.vehicle_color}")
    return "\n".join(lines)


async def _resolve_lang(passenger_id: str) -> str:
    async with async_session_factory() as db_session:
        user = await get_user_by_id(db_session, user_id=passenger_id)
        if user is None:
            return "lt"
        return user.preferred_language


async def _send_to_passenger(*, passenger_id: str, text: str) -> None:
    if not _notifications_enabled():
        return
    chat_id = _resolve_chat_id(passenger_id)
    if chat_id is None:
        return
    try:
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_message(chat_id=chat_id, text=text)
    except Exception:
        logger.exception("Failed to deliver passenger Telegram notification.")


async def _send_pickup_point(*, passenger_id: str, request: RideRequest) -> None:
    if not _notifications_enabled():
        return
    chat_id = _resolve_chat_id(passenger_id)
    if chat_id is None:
        return
    try:
        lang = await _resolve_lang(passenger_id)
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_location(
                chat_id=chat_id,
                latitude=request.from_lat,
                longitude=request.from_lng,
            )
            await bot.send_message(
                chat_id=chat_id,
                text=f"{t('notif.pickup', lang)}: {request.from_address}",
            )
    except Exception:
        logger.exception("Failed to deliver passenger pickup location.")


def _build_message(status: str, *, request: RideRequest, driver: Driver | None, lang: str) -> str | None:
    """Возвращает текст уведомления для конкретного статуса или None, если уведомлять не нужно."""
    ride_dt = request.date_time.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M")

    if status == "assigned":
        if driver is None:
            return None
        return (
            f"{t('notif.assigned', lang)}\n\n"
            f"{_driver_card(driver)}\n\n"
            f"📍 {t('notif.pickup', lang)}: {request.from_address}\n"
            f"🕐 {t('notif.time', lang)}: {ride_dt} UTC"
        )

    if status == "en_route_to_pickup":
        base = t("notif.en_route", lang)
        if driver:
            base += f"\n\n{_driver_card(driver)}"
        return base

    if status == "awaiting_passenger":
        base = t("notif.awaiting", lang)
        if driver:
            base += f"\n\n{_driver_card(driver)}"
        return base

    if status == "in_progress":
        return t("notif.in_progress", lang)

    if status == "completed":
        return (
            f"{t('notif.completed', lang)}\n\n"
            f"{t('notif.route', lang)}: {request.from_address} → {request.to_address}\n\n"
            f"{t('notif.thanks', lang)}"
        )

    return None


async def notify_passenger_pickup_changed(*, request: RideRequest, driver: Driver | None) -> None:
    """Notify passenger that the driver has changed their pickup point."""
    if not _notifications_enabled():
        return
    chat_id = _resolve_chat_id(request.passenger_id)
    if chat_id is None:
        return

    lang = await _resolve_lang(request.passenger_id)
    text = f"{t('notif.pickup_changed', lang)}\n\n"
    text += f"{t('notif.new_pickup', lang)}: {request.from_address}\n\n"
    if driver:
        text += f"{_driver_card(driver)}\n\n"
    text += t("notif.pickup_confirm_prompt", lang)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text=t("pickup.confirm_button", lang),
                callback_data=f"pickup_confirm:{request.id}",
            )],
        ]
    )

    try:
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_location(
                chat_id=chat_id,
                latitude=request.from_lat,
                longitude=request.from_lng,
            )
            await bot.send_message(
                chat_id=chat_id,
                text=text,
                reply_markup=keyboard,
            )
    except Exception:
        logger.exception("Failed to deliver passenger pickup-changed notification.")


async def notify_passenger_driver_assigned(*, request: RideRequest, driver: Driver | None) -> None:
    if driver is None:
        return
    lang = await _resolve_lang(request.passenger_id)
    text = _build_message("assigned", request=request, driver=driver, lang=lang)
    if text:
        await _send_to_passenger(passenger_id=request.passenger_id, text=text)
    await _send_pickup_point(passenger_id=request.passenger_id, request=request)


async def notify_passenger_status_changed(
    *,
    request: RideRequest,
    previous_status: str,
    driver: Driver | None = None,
) -> None:
    if previous_status == request.status:
        return
    lang = await _resolve_lang(request.passenger_id)
    text = _build_message(request.status, request=request, driver=driver, lang=lang)
    if text:
        await _send_to_passenger(passenger_id=request.passenger_id, text=text)
    if request.status == "assigned":
        await _send_pickup_point(passenger_id=request.passenger_id, request=request)
