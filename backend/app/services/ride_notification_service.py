from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.i18n import t
from app.models.notification import (
    Notification,
    NotificationPool,
    NotificationRecipientType,
    NotificationType,
)
from app.models.ride_request import RideRequest, RideRequestStatus
from app.services.notification_service import (
    NotificationRecipient,
    create_notification,
    list_active_admin_keys_for_applications,
)
from app.services.user_service import get_user_by_id

logger = logging.getLogger(__name__)

# Антиспам для чата: не создаём новую запись уведомления на каждое сообщение,
# а обновляем «свежую» непрочитанную запись этого же треда.
CHAT_NOTIFICATION_MERGE_MINUTES = 10


class RideEvent:
    """События поездки, которые дублируются в личный кабинет (не только в Telegram)."""

    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    ARRIVED = "arrived"
    STARTED = "started"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    STATUS_UNDO = "status_undo"
    PASSENGER_READY = "passenger_ready"
    PASSENGER_NUDGE = "passenger_nudge"
    CHAT_MESSAGE = "chat_message"
    ADMIN_ATTENTION = "admin_attention"
    WAIT_REMINDER = "wait_reminder"
    NO_SHOW_AVAILABLE = "no_show_available"
    DRIVER_LATE = "driver_late"
    EN_ROUTE_STUCK = "en_route_stuck"
    RIDE_STUCK = "ride_stuck"
    # Водитель не завершил поездку: пассажиру уходит вопрос «Поездка состоялась?» с кнопками.
    COMPLETION_CHECK = "completion_check"
    # Пассажир ответил «нет»: водителю нужно знать, что поездка разбирается администратором.
    COMPLETION_DECLINED = "completion_declined"


NOTIFICATION_TYPE_BY_EVENT: dict[str, str] = {
    RideEvent.ASSIGNED: NotificationType.RIDE_ASSIGNED,
    RideEvent.EN_ROUTE: NotificationType.RIDE_EN_ROUTE,
    RideEvent.ARRIVED: NotificationType.RIDE_ARRIVED,
    RideEvent.STARTED: NotificationType.RIDE_STARTED,
    RideEvent.COMPLETED: NotificationType.RIDE_COMPLETED,
    RideEvent.CANCELLED: NotificationType.RIDE_CANCELLED,
    RideEvent.NO_SHOW: NotificationType.RIDE_NO_SHOW,
    RideEvent.STATUS_UNDO: NotificationType.RIDE_STATUS_UNDO,
    RideEvent.PASSENGER_READY: NotificationType.RIDE_PASSENGER_READY,
    RideEvent.PASSENGER_NUDGE: NotificationType.RIDE_PASSENGER_NUDGE,
    RideEvent.CHAT_MESSAGE: NotificationType.RIDE_CHAT_MESSAGE,
    RideEvent.ADMIN_ATTENTION: NotificationType.RIDE_ADMIN_ATTENTION,
    RideEvent.WAIT_REMINDER: NotificationType.RIDE_WAIT_REMINDER,
    RideEvent.NO_SHOW_AVAILABLE: NotificationType.RIDE_NO_SHOW_AVAILABLE,
    RideEvent.DRIVER_LATE: NotificationType.RIDE_DRIVER_LATE,
    RideEvent.EN_ROUTE_STUCK: NotificationType.RIDE_EN_ROUTE_STUCK,
    RideEvent.RIDE_STUCK: NotificationType.RIDE_RIDE_STUCK,
    RideEvent.COMPLETION_CHECK: NotificationType.RIDE_COMPLETION_CHECK,
    RideEvent.COMPLETION_DECLINED: NotificationType.RIDE_COMPLETION_DECLINED,
}


def passenger_recipient(user_id: str) -> NotificationRecipient:
    return NotificationRecipient(
        pool=NotificationPool.PASSENGER,
        recipient_type=NotificationRecipientType.USER,
        recipient_id=user_id,
    )


def driver_recipient(driver_id: str) -> NotificationRecipient:
    return NotificationRecipient(
        pool=NotificationPool.DRIVER,
        recipient_type=NotificationRecipientType.DRIVER,
        recipient_id=driver_id,
    )


def admin_recipient(admin_key_id: str) -> NotificationRecipient:
    return NotificationRecipient(
        pool=NotificationPool.ADMIN,
        recipient_type=NotificationRecipientType.ADMIN_KEY,
        recipient_id=admin_key_id,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _text(key: str, lang: str, **values: object) -> str:
    """Текст из bot/i18n c безопасной подстановкой значений."""
    template = t(key, lang)
    for name, value in values.items():
        template = template.replace("{" + name + "}", "" if value is None else str(value))
    return template


def _ride_payload(ride: RideRequest, *, event: str, extra: dict | None = None) -> dict:
    payload: dict = {
        "kind": "ride",
        "event": event,
        "rideId": ride.id,
        "rideNumber": ride.ride_number,
        "status": ride.status,
        "fromAddress": ride.from_address,
        "toAddress": ride.to_address,
        "dateTime": _as_aware(ride.date_time).isoformat() if ride.date_time else None,
    }
    if extra:
        payload.update(extra)
    return payload


def _with_confirmation_flag(ride: RideRequest, *, event: str, payload_extra: dict | None) -> dict:
    """Вопрос «Поездка состоялась?» всегда несёт признаки кнопок [Да]/[Нет].

    Фронтенд и Telegram-клавиатура ориентируются на payload, а не на текст: так
    формулировку можно менять без правок UI, а «мёртвые» кнопки не появляются
    у обычных событий поездки.
    """
    extra = dict(payload_extra or {})
    if event == RideEvent.COMPLETION_CHECK:
        extra.setdefault("requiresConfirmation", True)
        extra.setdefault("confirmationKind", "ride_completed")
        extra.setdefault("rideId", ride.id)
    return extra


async def dismiss_completion_check(db_session: AsyncSession, *, ride: RideRequest) -> int:
    """Убирает кнопки [Да]/[Нет] у вопроса, на который уже ответили.

    Иначе в ленте остаётся «мёртвая» карточка: ответ отправлен, поездка уже
    переведена в новый статус, а кнопки всё ещё предлагают ответить.
    """
    if not ride.passenger_id:
        return 0
    result = await db_session.execute(
        select(Notification).where(
            Notification.pool == NotificationPool.PASSENGER,
            Notification.recipient_type == NotificationRecipientType.USER,
            Notification.recipient_id == ride.passenger_id,
            Notification.type == NotificationType.RIDE_COMPLETION_CHECK,
            Notification.read_at.is_(None),
        )
    )
    marked = 0
    moment = _now()
    for entity in result.scalars().all():
        payload = entity.payload if isinstance(entity.payload, dict) else {}
        if payload.get("rideId") not in (None, ride.id):
            continue
        entity.read_at = moment
        marked += 1
    if marked:
        await db_session.flush()
    return marked


def _describe_driver(driver) -> str:
    """«Имя · VW Golf · Синий · ABC123» — компактно и без пустых слотов."""
    if driver is None:
        return ""
    car = " ".join(part for part in [driver.car_brand, driver.car_model] if part and part != "Unknown")
    color = driver.vehicle_color if driver.vehicle_color and driver.vehicle_color != "Unknown" else ""
    parts = [driver.name, car, color, driver.car_plate]
    return " · ".join(part for part in parts if part)


async def _passenger_language(db_session: AsyncSession, *, passenger_id: str | None) -> str:
    if not passenger_id:
        return "lt"
    user = await get_user_by_id(db_session, user_id=passenger_id)
    if user is None:
        return "lt"
    return user.preferred_language


async def _driver_language(db_session: AsyncSession, *, driver_id: str | None) -> str:
    if not driver_id:
        return "lt"
    from app.services.driver_service import get_driver

    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None or not driver.user_id:
        return "lt"
    user = await get_user_by_id(db_session, user_id=driver.user_id)
    if user is None:
        return "lt"
    return user.preferred_language


def _event_values(ride: RideRequest, *, driver=None, extra: dict | None = None) -> dict:
    from app.bot.datetime_format import format_bot_date, format_bot_time

    values = {
        "ride_number": ride.ride_number,
        "passenger_name": ride.passenger_name,
        "from_address": ride.from_address,
        "to_address": ride.to_address,
        "date": format_bot_date(ride.date_time) if ride.date_time else "",
        "time": format_bot_time(ride.date_time) if ride.date_time else "",
        "driver_name": getattr(driver, "name", "") or "",
        "driver_car": _describe_driver(driver),
    }
    if extra:
        values.update(extra)
    return values


def decorate_event_values(
    *,
    pool: str,
    event: str,
    lang: str,
    values: dict,
    extra: dict | None = None,
) -> dict:
    """Добавляет в шаблон вычисляемые куски: примечание о поздней отмене, название статуса.

    И in-app, и Telegram используют один и тот же набор текстов — значит, обе точки входа
    должны подставлять одинаковые значения.
    """
    payload = extra or {}
    if pool == "driver" and event == RideEvent.CANCELLED:
        values["late_note"] = (
            t("notif.ride.driver.cancelled.late_note", lang) if payload.get("late") else ""
        )
    corrected = payload.get("correctedStatus")
    if event == RideEvent.STATUS_UNDO and corrected:
        values["corrected_status"] = t(f"notif.status.{corrected}", lang)
    if event == RideEvent.CHAT_MESSAGE:
        values.setdefault("sender_name", payload.get("senderName") or "")
        values.setdefault("text", payload.get("text") or "")
    return values


async def notify_passenger_for_ride_event(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    event: str,
    driver=None,
    extra: dict | None = None,
    payload_extra: dict | None = None,
) -> Notification | None:
    """Кладёт событие поездки в личный кабинет пассажира (in-app уведомление)."""
    if not ride.passenger_id:
        return None
    notification_type = NOTIFICATION_TYPE_BY_EVENT.get(event)
    if notification_type is None:
        return None

    lang = await _passenger_language(db_session, passenger_id=ride.passenger_id)
    merged_extra = {**(payload_extra or {}), **(extra or {})}
    values = decorate_event_values(
        pool="passenger",
        event=event,
        lang=lang,
        values=_event_values(ride, driver=driver, extra=merged_extra),
        extra=merged_extra,
    )
    title = _text(f"notif.ride.passenger.{event}.title", lang, **values)
    body = _text(f"notif.ride.passenger.{event}.body", lang, **values)
    return await create_notification(
        db_session,
        recipient=passenger_recipient(ride.passenger_id),
        notification_type=notification_type,
        title=title,
        body=body,
        payload=_ride_payload(
            ride,
            event=event,
            extra=_with_confirmation_flag(ride, event=event, payload_extra=payload_extra),
        ),
    )


async def notify_driver_for_ride_event(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    event: str,
    extra: dict | None = None,
    payload_extra: dict | None = None,
) -> Notification | None:
    """Кладёт событие поездки в кабинет водителя (in-app уведомление)."""
    if not ride.driver_id:
        return None
    notification_type = NOTIFICATION_TYPE_BY_EVENT.get(event)
    if notification_type is None:
        return None

    lang = await _driver_language(db_session, driver_id=ride.driver_id)
    merged_extra = {**(payload_extra or {}), **(extra or {})}
    values = decorate_event_values(
        pool="driver",
        event=event,
        lang=lang,
        values=_event_values(ride, extra=merged_extra),
        extra=merged_extra,
    )
    title = _text(f"notif.ride.driver.{event}.title", lang, **values)
    body = _text(f"notif.ride.driver.{event}.body", lang, **values)
    return await create_notification(
        db_session,
        recipient=driver_recipient(ride.driver_id),
        notification_type=notification_type,
        title=title,
        body=body,
        payload=_ride_payload(ride, event=event, extra=payload_extra),
    )


async def notify_admins_ride_attention(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    reason: str,
    extra: dict | None = None,
) -> int:
    """Сообщает администраторам, что поездка «зависла» и требует ручного вмешательства."""
    admin_keys = await list_active_admin_keys_for_applications(db_session)
    if not admin_keys:
        return 0

    values = _event_values(ride, extra=extra)
    values["reason"] = _text(f"notif.ride.attention_reason.{reason}", "lt", **values)
    title = _text("notif.ride.admin.attention.title", "lt", **values)
    body = _text("notif.ride.admin.attention.body", "lt", **values)

    created = 0
    for admin_key in admin_keys:
        await create_notification(
            db_session,
            recipient=admin_recipient(admin_key.id),
            notification_type=NotificationType.RIDE_ADMIN_ATTENTION,
            title=title,
            body=body,
            payload=_ride_payload(
                ride,
                event=RideEvent.ADMIN_ATTENTION,
                extra={"attentionReason": reason},
            ),
        )
        created += 1
    return created


async def _merge_or_create_chat_notification(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
    lang: str,
    ride: RideRequest,
    sender_name: str,
    text: str,
) -> None:
    """Одно уведомление на «свежую» переписку вместо записи на каждое сообщение."""
    since = _now() - timedelta(minutes=CHAT_NOTIFICATION_MERGE_MINUTES)
    existing = await db_session.execute(
        select(Notification).where(
            Notification.pool == recipient.pool,
            Notification.recipient_type == recipient.recipient_type,
            Notification.recipient_id == recipient.recipient_id,
            Notification.type == NotificationType.RIDE_CHAT_MESSAGE,
            Notification.read_at.is_(None),
            Notification.created_at >= since,
            Notification.payload["rideId"].astext == ride.id,
        )
    )
    entity = existing.scalars().first()

    title = _text("notif.ride.chat.title", lang, sender_name=sender_name)
    body = _text("notif.ride.chat.body", lang, sender_name=sender_name, text=text)
    if entity is not None:
        entity.title = title
        entity.body = body
        entity.created_at = _now()
        await db_session.flush()
        return

    await create_notification(
        db_session,
        recipient=recipient,
        notification_type=NotificationType.RIDE_CHAT_MESSAGE,
        title=title,
        body=body,
        payload=_ride_payload(ride, event=RideEvent.CHAT_MESSAGE, extra={"senderName": sender_name}),
    )


async def notify_chat_message(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    sender_type: str,
    sender_name: str,
    text: str,
) -> int:
    """Уведомляет остальных участников треда о новом сообщении в чате.

    Возвращает количество адресатов. Пассажир пишет — узнаёт водитель и попутчики;
    водитель пишет — узнают все пассажиры машины.
    """
    from app.services.ride_chat_service import list_thread_ride_ids

    notified = 0
    thread_ride_ids = await list_thread_ride_ids(db_session, thread_key=_thread_key(ride))

    if sender_type == "passenger":
        if ride.driver_id:
            lang = await _driver_language(db_session, driver_id=ride.driver_id)
            await _merge_or_create_chat_notification(
                db_session,
                recipient=driver_recipient(ride.driver_id),
                lang=lang,
                ride=ride,
                sender_name=sender_name,
                text=text,
            )
            notified += 1
        # Попутчики той же машины (кроме автора) тоже видят сообщение в уведомлениях.
        for other in await _rides_by_ids(db_session, ride_ids=thread_ride_ids, exclude_ride_id=ride.id):
            if not other.passenger_id:
                continue
            lang = await _passenger_language(db_session, passenger_id=other.passenger_id)
            await _merge_or_create_chat_notification(
                db_session,
                recipient=passenger_recipient(other.passenger_id),
                lang=lang,
                ride=other,
                sender_name=sender_name,
                text=text,
            )
            notified += 1
        return notified

    for other in await _rides_by_ids(db_session, ride_ids=thread_ride_ids, exclude_ride_id=None):
        if not other.passenger_id:
            continue
        lang = await _passenger_language(db_session, passenger_id=other.passenger_id)
        await _merge_or_create_chat_notification(
            db_session,
            recipient=passenger_recipient(other.passenger_id),
            lang=lang,
            ride=other,
            sender_name=sender_name,
            text=text,
        )
        notified += 1
    return notified


def _thread_key(ride: RideRequest) -> str:
    from app.services.ride_chat_service import thread_key_for

    return thread_key_for(ride)


async def _rides_by_ids(
    db_session: AsyncSession,
    *,
    ride_ids: list[str],
    exclude_ride_id: str | None,
) -> list[RideRequest]:
    wanted = [item for item in ride_ids if item != exclude_ride_id]
    if not wanted:
        return []
    result = await db_session.execute(
        select(RideRequest).where(
            RideRequest.id.in_(wanted),
            RideRequest.status.in_(RideRequestStatus.CHAT_OPEN),
        )
    )
    return list(result.scalars().all())


async def notify_ride_assigned(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    driver=None,
) -> None:
    """Назначение водителя: дублируем в приложение и пассажиру, и водителю.

    До этого назначение уходило только в Telegram — пассажир в мини-аппе ничего не видел.
    """
    if driver is None and ride.driver_id:
        from app.services.driver_service import get_driver

        driver = await get_driver(db_session, driver_id=ride.driver_id)
    payload_extra = {"driverName": getattr(driver, "name", "") or ""}
    await notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.ASSIGNED,
        driver=driver,
        payload_extra=payload_extra,
    )
    await notify_driver_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.ASSIGNED,
        payload_extra=payload_extra,
    )
    await db_session.commit()


__all__ = [
    "RideEvent",
    "admin_recipient",
    "decorate_event_values",
    "dismiss_completion_check",
    "driver_recipient",
    "notify_admins_ride_attention",
    "notify_chat_message",
    "notify_driver_for_ride_event",
    "notify_passenger_for_ride_event",
    "notify_ride_assigned",
    "passenger_recipient",
]
