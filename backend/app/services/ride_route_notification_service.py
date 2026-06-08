from __future__ import annotations

import html
import logging

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.i18n import t
from app.core.config import settings
from app.db import async_session_factory
from app.models.driver import Driver
from app.models.ride_request import RideRequest
from app.services.passenger_notification_service import (
    _driver_card,
    notify_passenger_pickup_changed,
)
from app.services.ride_route_update_service import RouteChangeActor, RoutePointKind
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


async def _resolve_lang(user_id: str) -> str:
    async with async_session_factory() as db_session:
        user = await get_user_by_id(db_session, user_id=user_id)
        if user is not None:
            return user.preferred_language
    return "lt"


async def _send_location(*, chat_id: int, lat: float, lng: float) -> None:
    async with Bot(token=settings.bot_token) as bot:
        await bot.send_location(chat_id=chat_id, latitude=lat, longitude=lng)


async def _send_message(
    *,
    chat_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    async with Bot(token=settings.bot_token) as bot:
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            reply_markup=reply_markup,
            parse_mode=ParseMode.HTML,
        )


def _point_label(lang: str, point: RoutePointKind) -> str:
    if point == "from":
        return t("booking.pointA", lang)
    return t("booking.pointB", lang)


def _route_change_header(actor: RouteChangeActor, point: RoutePointKind, lang: str) -> str:
    if actor == RouteChangeActor.DRIVER:
        return t("notif.pickup_changed" if point == "from" else "notif.dropoff_changed", lang)
    if actor == RouteChangeActor.ADMIN:
        return t("notif.admin_pickup_changed" if point == "from" else "notif.admin_dropoff_changed", lang)
    return t("notif.passenger_pickup_changed" if point == "from" else "notif.passenger_dropoff_changed", lang)


async def _notify_passenger_route_changed(
    *,
    request: RideRequest,
    actor: RouteChangeActor,
    changed: frozenset[RoutePointKind],
    driver: Driver | None,
) -> None:
    if not changed or actor == RouteChangeActor.PASSENGER:
        return
    chat_id = _resolve_chat_id(request.passenger_id)
    if chat_id is None:
        return

    lang = await _resolve_lang(request.passenger_id)

    if actor == RouteChangeActor.DRIVER and "from" in changed and len(changed) == 1:
        await notify_passenger_pickup_changed(request=request, driver=driver)
        return

    try:
        async with Bot(token=settings.bot_token) as bot:
            for point in sorted(changed):
                if point == "from":
                    await bot.send_location(
                        chat_id=chat_id,
                        latitude=request.from_lat,
                        longitude=request.from_lng,
                    )
                    address = html.escape(request.from_address)
                else:
                    await bot.send_location(
                        chat_id=chat_id,
                        latitude=request.to_lat,
                        longitude=request.to_lng,
                    )
                    address = html.escape(request.to_address)

                if actor == RouteChangeActor.DRIVER:
                    header = _route_change_header(actor, point, lang)
                    text = (
                        f"{html.escape(header)}\n\n"
                        f"{html.escape(_point_label(lang, point))}: {address}"
                    )
                    if driver:
                        text += f"\n\n{html.escape(_driver_card(driver))}"
                    if point == "from":
                        text += f"\n\n{html.escape(t('notif.pickup_confirm_prompt', lang))}"
                        keyboard = InlineKeyboardMarkup(
                            inline_keyboard=[
                                [InlineKeyboardButton(
                                    text=t("pickup.confirm_button", lang),
                                    callback_data=f"pickup_confirm:{request.id}",
                                )],
                            ]
                        )
                        await bot.send_message(
                            chat_id=chat_id,
                            text=text,
                            reply_markup=keyboard if point == "from" else None,
                            parse_mode=ParseMode.HTML,
                        )
                    else:
                        await bot.send_message(
                            chat_id=chat_id,
                            text=text,
                            parse_mode=ParseMode.HTML,
                        )
                elif actor == RouteChangeActor.ADMIN:
                    header = _route_change_header(actor, point, lang)
                    text = (
                        f"{html.escape(header)}\n\n"
                        f"{html.escape(_point_label(lang, point))}: {address}"
                    )
                    await bot.send_message(
                        chat_id=chat_id,
                        text=text,
                        parse_mode=ParseMode.HTML,
                    )
    except Exception:
        logger.exception("Failed to deliver passenger route-change notification.")


async def _notify_driver_route_changed(
    *,
    request: RideRequest,
    actor: RouteChangeActor,
    changed: frozenset[RoutePointKind],
    driver: Driver,
) -> None:
    if not changed or actor == RouteChangeActor.DRIVER:
        return
    if not driver.user_id:
        return
    chat_id = _resolve_chat_id(driver.user_id)
    if chat_id is None:
        return

    lang = await _resolve_lang(driver.user_id)

    try:
        async with Bot(token=settings.bot_token) as bot:
            for point in sorted(changed):
                if point == "from":
                    await bot.send_location(
                        chat_id=chat_id,
                        latitude=request.from_lat,
                        longitude=request.from_lng,
                    )
                    address = html.escape(request.from_address)
                else:
                    await bot.send_location(
                        chat_id=chat_id,
                        latitude=request.to_lat,
                        longitude=request.to_lng,
                    )
                    address = html.escape(request.to_address)
                header = _route_change_header(actor, point, lang)
                text = (
                    f"{html.escape(header)}\n\n"
                    f"№{request.ride_number} · {html.escape(request.passenger_name)}\n"
                    f"{html.escape(_point_label(lang, point))}: {address}"
                )
                await bot.send_message(
                    chat_id=chat_id,
                    text=text,
                    parse_mode=ParseMode.HTML,
                )
    except Exception:
        logger.exception("Failed to deliver driver route-change notification.")


async def notify_route_changed(
    *,
    request: RideRequest,
    actor: RouteChangeActor,
    changed: frozenset[RoutePointKind],
    driver: Driver | None,
) -> None:
    if not _notifications_enabled() or not changed:
        return
    await _notify_passenger_route_changed(
        request=request,
        actor=actor,
        changed=changed,
        driver=driver,
    )
    if driver is not None:
        await _notify_driver_route_changed(
            request=request,
            actor=actor,
            changed=changed,
            driver=driver,
        )
