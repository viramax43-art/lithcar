from __future__ import annotations

import logging

from app.services.driver_notification_service import (
    notify_driver_chat_message,
    notify_driver_ride_event,
)
from app.services.passenger_notification_service import (
    notify_passenger_chat_message,
    notify_passenger_ride_event,
)
from app.services.ride_notification_service import RideEvent

logger = logging.getLogger(__name__)


async def deliver_flow_side_effects(result, *, driver=None) -> None:
    """Отправляет Telegram-дубли после коммита изменений поездки.

    In-app уведомления уже записаны в БД вместе со сменой статуса (транзакционно),
    а Telegram отправляем только после успешного коммита — чтобы не слать «пустышки».
    """
    if not getattr(result, "changed", False) or result.event is None:
        return

    targets = set(result.telegram_targets or [])
    extra = dict(result.extra or {})
    try:
        if "passenger" in targets:
            await notify_passenger_ride_event(
                request=result.ride,
                event=result.event,
                driver=driver,
                extra=extra,
            )
        if "driver" in targets:
            await notify_driver_ride_event(
                request=result.ride,
                event=result.event,
                driver=driver,
                extra=extra,
            )
    except Exception:  # noqa: BLE001
        # Сбой Telegram не должен ломать смену статуса: уведомление уже лежит в приложении.
        logger.exception("Failed to deliver ride flow Telegram notification.")


async def deliver_chat_side_effects(
    *,
    ride,
    sender_type: str,
    sender_name: str,
    text: str,
    driver=None,
) -> None:
    """Пересылает сообщение чата собеседникам в Telegram (in-app уже записан)."""
    try:
        if sender_type == "passenger":
            await notify_driver_chat_message(request=ride, sender_name=sender_name, text=text)
            return
        await notify_passenger_chat_message(request=ride, sender_name=sender_name, text=text)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to relay ride chat message to Telegram.")


__all__ = [
    "RideEvent",
    "deliver_chat_side_effects",
    "deliver_flow_side_effects",
]