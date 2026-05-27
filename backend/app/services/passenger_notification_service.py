from __future__ import annotations

import logging
from datetime import timezone

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.core.config import settings
from app.models.driver import Driver
from app.models.ride_request import RideRequest


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
    car = " ".join(p for p in [driver.car_brand, driver.car_model] if p).strip() or "Автомобиль"
    lines = [
        f"👤 {driver.name}",
        f"🚗 {car}, {driver.car_plate}",
    ]
    if driver.vehicle_color:
        lines.append(f"🎨 {driver.vehicle_color}")
    return "\n".join(lines)


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
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_location(
                chat_id=chat_id,
                latitude=request.from_lat,
                longitude=request.from_lng,
            )
            await bot.send_message(
                chat_id=chat_id,
                text=f"Точка подачи: {request.from_address}",
            )
    except Exception:
        logger.exception("Failed to deliver passenger pickup location.")


def _build_message(status: str, *, request: RideRequest, driver: Driver | None) -> str | None:
    """Возвращает текст уведомления для конкретного статуса или None, если уведомлять не нужно."""
    ride_dt = request.date_time.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M")

    if status == "assigned":
        if driver is None:
            return None
        return (
            "✅ Для вашей поездки назначен водитель!\n\n"
            f"{_driver_card(driver)}\n\n"
            f"📍 Подача: {request.from_address}\n"
            f"🕐 Время: {ride_dt} UTC"
        )

    if status == "en_route_to_pickup":
        base = "🚗 Водитель уже едет к вам!\n\nОставайтесь рядом с точкой подачи."
        if driver:
            base += f"\n\n{_driver_card(driver)}"
        return base

    if status == "awaiting_passenger":
        base = "📍 Водитель приехал на место и ждёт вас.\n\nПожалуйста, подойдите как можно скорее."
        if driver:
            base += f"\n\n{_driver_card(driver)}"
        return base

    if status == "in_progress":
        return "▶️ Поездка началась. Приятной дороги! 🛣"

    if status == "completed":
        return (
            "🏁 Поездка завершена.\n\n"
            f"Маршрут: {request.from_address} → {request.to_address}\n\n"
            "Спасибо, что воспользовались Ride!"
        )

    return None


async def notify_passenger_pickup_changed(*, request: RideRequest, driver: Driver | None) -> None:
    """Notify passenger that the driver has changed their pickup point."""
    if not _notifications_enabled():
        return
    chat_id = _resolve_chat_id(request.passenger_id)
    if chat_id is None:
        return

    text = "📍 Водитель изменил точку подачи!\n\n"
    text += f"Новая точка: {request.from_address}\n\n"
    if driver:
        text += f"{_driver_card(driver)}\n\n"
    text += "Пожалуйста, подтвердите новую точку посадки кнопкой ниже."

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text="✅ Подтвердить точку посадки",
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
    text = _build_message("assigned", request=request, driver=driver)
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
    text = _build_message(request.status, request=request, driver=driver)
    if text:
        await _send_to_passenger(passenger_id=request.passenger_id, text=text)
    if request.status == "assigned":
        await _send_pickup_point(passenger_id=request.passenger_id, request=request)
