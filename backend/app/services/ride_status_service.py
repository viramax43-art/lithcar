from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.i18n import t
from app.core.config import settings
from app.models.ride_request import (
    RideAdminAttentionReason,
    RideCancelReason,
    RideRequest,
    RideRequestStatus,
)
from app.models.ride_status_event import RideStatusActorType, RideStatusEvent
from app.services import ride_chat_service, ride_notification_service
from app.services.ride_chat_service import RideChatMessageKind
from app.services.ride_notification_service import RideEvent

logger = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_000.0


class RideFlowError(Exception):
    """Ошибка перехода статуса: код/текст уходят в HTTP-ответ, extra — для UI (таймеры и подсказки)."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        extra: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.extra = extra or {}


@dataclass
class RideFlowResult:
    """Результат операции: что стало с поездкой и какие уведомления нужно отправить в Telegram."""

    ride: RideRequest
    previous_status: str
    changed: bool = False
    event: str | None = None
    extra: dict = field(default_factory=dict)
    telegram_targets: list[str] = field(default_factory=list)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _minutes(value: int) -> timedelta:
    return timedelta(minutes=max(0, int(value)))


def _iso(value: datetime | None) -> str | None:
    aware = _as_aware(value)
    return aware.isoformat() if aware else None


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Расстояние между точками в метрах — нужно для проверки «водитель реально на точке»."""
    from math import asin, cos, radians, sin, sqrt

    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))


# Результаты ответа пассажира на вопрос «Поездка состоялась?».
COMPLETION_CONFIRMED = "confirmed"
COMPLETION_DECLINED = "declined"


def estimated_ride_duration_minutes(ride: RideRequest) -> tuple[float, str]:
    """Сколько примерно ехать из A в B — основа таймера вопроса пассажиру.

    Приоритет источников: маршрутная оценка из расчёта цены → дорожные километры →
    прямая дистанция → значение по умолчанию. Оценка нужна не для денег, а чтобы
    задать вопрос «Поездка состоялась?» через разумное время, а не «через час всем».
    """
    quoted = ride.quote_duration_min
    if quoted and float(quoted) > 0:
        return float(quoted), "quote"

    speed = max(1.0, float(settings.ride_completion_check_speed_kmh))
    road_km = float(ride.quote_road_km) if ride.quote_road_km and ride.quote_road_km > 0 else 0.0
    if road_km <= 0:
        straight_km = (
            haversine_meters(ride.from_lat, ride.from_lng, ride.to_lat, ride.to_lng) / 1000.0
        )
        if straight_km >= 0.5:
            # Дорога длиннее прямой: коэффициент 1.3 — та же логика, что в оценке без OSRM.
            road_km = straight_km * 1.3
    if road_km > 0:
        return max(1.0, road_km / speed * 60.0), "distance"

    return float(settings.ride_completion_check_fallback_minutes), "fallback"


def completion_check_delay_minutes(ride: RideRequest) -> tuple[int, float, str]:
    """Через сколько минут после старта спрашивать «Поездка состоялась?».

    Возвращает (задержка, оценка времени в пути, источник оценки): всё это уходит
    в payload уведомления, чтобы разбор спора опирался на числа, а не на «показалось».
    """
    expected, source = estimated_ride_duration_minutes(ride)
    factor = max(1.0, float(settings.ride_completion_check_factor))
    delay = expected * factor
    delay = max(delay, float(settings.ride_completion_check_min_minutes))
    delay = min(delay, float(settings.ride_completion_check_max_minutes))
    return int(round(delay)), round(expected, 1), source


def completion_check_due_at(ride: RideRequest) -> datetime | None:
    """Момент вопроса: старт поездки + 2× расчётного времени в пути."""
    started_at = _as_aware(ride.started_at)
    if started_at is None:
        return None
    delay, _, _ = completion_check_delay_minutes(ride)
    return started_at + timedelta(minutes=delay)


def completion_check_escalate_at(ride: RideRequest) -> datetime | None:
    """Когда звать администратора, если пассажир молчит."""
    check_at = _as_aware(ride.completion_check_at)
    if check_at is None:
        return None
    return check_at + _minutes(settings.ride_completion_check_escalate_minutes)


def completion_check_state(ride: RideRequest, *, now: datetime | None = None) -> dict:
    """Состояние вопроса «Поездка состоялась?» — для карточки поездки в приложении."""
    moment = _as_aware(now) or _now()
    expected, source = estimated_ride_duration_minutes(ride)
    due_at = completion_check_due_at(ride)
    sent = ride.completion_check_at is not None
    answered = ride.completion_check_answered_at is not None
    seconds_left = 0
    if due_at is not None and not sent:
        seconds_left = max(0, int((due_at - moment).total_seconds()))
    return {
        "expectedRideMinutes": round(expected, 1),
        "estimationSource": source,
        "completionCheckDueAt": _iso(due_at),
        "completionCheckAt": _iso(ride.completion_check_at),
        "completionCheckSecondsLeft": seconds_left,
        "completionCheckAnswered": answered,
        "completionCheckResult": ride.completion_check_result,
        "canConfirmCompletion": ride.status == RideRequestStatus.IN_PROGRESS and sent and not answered,
        "completionEscalateAt": _iso(completion_check_escalate_at(ride)),
    }


async def lock_ride(db_session: AsyncSession, *, ride_id: str) -> RideRequest | None:
    """Берём строку поездки под блокировку: два устройства не смогут «обогнать» друг друга."""
    result = await db_session.execute(
        select(RideRequest).where(RideRequest.id == ride_id).with_for_update()
    )
    return result.scalar_one_or_none()


async def _record_event(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    from_status: str | None,
    to_status: str,
    actor_type: str,
    actor_id: str | None,
    reason_code: str | None = None,
    payload: dict | None = None,
) -> None:
    db_session.add(
        RideStatusEvent(
            ride_id=ride.id,
            from_status=from_status,
            to_status=to_status,
            actor_type=actor_type,
            actor_id=actor_id,
            reason_code=reason_code,
            payload=payload,
        )
    )


def _status_label(status: str, lang: str) -> str:
    return t(f"notif.status.{status}", lang)


async def _system_message(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    key: str,
    payload: dict | None = None,
    values: dict | None = None,
) -> None:
    """Запись в чат поездки: это «история поездки» для обеих сторон.

    Текст пишем на языке пассажира (это его таймлайн), а `payload.event` позволяет
    фронтенду отрисовать локализованную строку у каждого участника.
    """
    lang = "lt"
    user = await _passenger_language(db_session, passenger_id=ride.passenger_id)
    if user:
        lang = user
    template = t(f"notif.ride.system.{key}", lang)
    body = template
    for name, value in (values or {}).items():
        body = body.replace("{" + name + "}", "" if value is None else str(value))
    await ride_chat_service.post_system_message(
        db_session,
        ride=ride,
        body=body,
        payload={"kind": "status", "event": key, "status": ride.status, **(payload or {})},
    )


async def _passenger_language(db_session: AsyncSession, *, passenger_id: str | None) -> str | None:
    if not passenger_id:
        return None
    from app.services.user_service import get_user_by_id

    user = await get_user_by_id(db_session, user_id=passenger_id)
    return user.preferred_language if user else None


def _flag_admin_attention(ride: RideRequest, *, reason: str, now: datetime) -> bool:
    """Помечаем поездку «требует внимания», если ещё не помечена (без мигания флага)."""
    if ride.admin_attention_at is not None:
        return False
    ride.admin_attention_at = now
    ride.admin_attention_reason = reason
    return True


def _clear_admin_attention(ride: RideRequest) -> None:
    ride.admin_attention_at = None
    ride.admin_attention_reason = None


def _assert_driver_owns(ride: RideRequest, *, driver_id: str) -> None:
    if ride.driver_id != driver_id:
        raise RideFlowError("not_assigned", "Эта поездка не назначена вам.", status_code=403)


def _assert_not_terminal(ride: RideRequest) -> None:
    if RideRequestStatus.is_terminal(ride.status):
        raise RideFlowError(
            "ride_closed",
            "Поездка уже завершена или отменена.",
            status_code=409,
        )


def _assert_en_route_not_too_early(ride: RideRequest, *, now: datetime) -> None:
    """Защита от «уже еду» за часы до подачи: пассажир не должен ждать впустую."""
    ride_dt = _as_aware(ride.date_time)
    if ride_dt is None:
        return
    earliest = ride_dt - _minutes(settings.ride_en_route_max_early_minutes)
    if now < earliest:
        raise RideFlowError(
            "too_early",
            "До подачи ещё много времени — отметку «Еду на точку» можно сделать позже.",
            status_code=409,
            extra={"canStartAt": _iso(earliest)},
        )


async def mark_en_route(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    lat: float | None = None,
    lng: float | None = None,
    now: datetime | None = None,
) -> RideFlowResult:
    """Водитель нажал «Еду на точку».

    Идемпотентно: повторное нажатие (второе устройство, двойной тап) — не ошибка и не спамит пассажира.
    """
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    _assert_driver_owns(ride, driver_id=driver_id)
    _assert_not_terminal(ride)

    if ride.status in (
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
        RideRequestStatus.IN_PROGRESS,
    ):
        if ride.en_route_at is None:
            ride.en_route_at = moment
            ride.status_updated_at = moment
            await db_session.commit()
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)

    if ride.status != RideRequestStatus.ASSIGNED:
        raise RideFlowError(
            "not_assigned",
            "Отметить «Еду на точку» можно только для назначенной поездки.",
            status_code=409,
        )

    _assert_en_route_not_too_early(ride, now=moment)

    previous_status = ride.status
    ride.status = RideRequestStatus.EN_ROUTE_TO_PICKUP
    ride.en_route_at = moment
    ride.status_updated_at = moment
    _clear_admin_attention(ride)

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=ride.status,
        actor_type=RideStatusActorType.DRIVER,
        actor_id=driver_id,
        payload={"lat": lat, "lng": lng},
    )
    await _system_message(db_session, ride=ride, key="en_route")
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.EN_ROUTE,
        payload_extra={"enRouteAt": _iso(moment)},
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.EN_ROUTE,
        telegram_targets=["passenger"],
    )


async def mark_arrived(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    lat: float | None = None,
    lng: float | None = None,
    now: datetime | None = None,
) -> RideFlowResult:
    """Водитель нажал «Прибыл»: ждём пассажира, включаем таймер ожидания и напоминания."""
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    _assert_driver_owns(ride, driver_id=driver_id)
    _assert_not_terminal(ride)

    if ride.status == RideRequestStatus.AWAITING_PASSENGER:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)

    if ride.status == RideRequestStatus.IN_PROGRESS:
        raise RideFlowError(
            "already_started",
            "Поездка уже началась — отметить прибытие нельзя.",
            status_code=409,
        )
    if ride.status not in (RideRequestStatus.ASSIGNED, RideRequestStatus.EN_ROUTE_TO_PICKUP):
        raise RideFlowError("not_assigned", "Поездка не в работе.", status_code=409)
    if ride.status == RideRequestStatus.ASSIGNED:
        # Водитель забыл нажать «Еду на точку» — считаем, что он всё равно уже приехал.
        _assert_en_route_not_too_early(ride, now=moment)

    distance_m: float | None = None
    if lat is not None and lng is not None:
        distance_m = haversine_meters(lat, lng, ride.from_lat, ride.from_lng)

    previous_status = ride.status
    if ride.en_route_at is None:
        ride.en_route_at = moment
    ride.status = RideRequestStatus.AWAITING_PASSENGER
    ride.arrived_at = moment
    ride.status_updated_at = moment
    ride.arrival_reminder_sent_at = None
    ride.no_show_available_notified_at = None
    if distance_m is not None:
        ride.arrival_distance_m = distance_m

    far_from_pickup = distance_m is not None and distance_m > settings.ride_arrival_radius_meters
    if far_from_pickup:
        _flag_admin_attention(
            ride,
            reason=RideAdminAttentionReason.ARRIVAL_FAR_FROM_PICKUP,
            now=moment,
        )

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=ride.status,
        actor_type=RideStatusActorType.DRIVER,
        actor_id=driver_id,
        payload={"lat": lat, "lng": lng, "distanceMeters": distance_m},
    )
    await _system_message(db_session, ride=ride, key="arrived")
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.ARRIVED,
        payload_extra={"arrivedAt": _iso(moment), "distanceMeters": distance_m},
    )
    if far_from_pickup:
        await ride_notification_service.notify_admins_ride_attention(
            db_session,
            ride=ride,
            reason=RideAdminAttentionReason.ARRIVAL_FAR_FROM_PICKUP,
            extra={"distanceMeters": int(distance_m or 0)},
        )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.ARRIVED,
        extra={"distanceMeters": distance_m, "farFromPickup": far_from_pickup},
        telegram_targets=["passenger"],
    )


async def start_ride(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    now: datetime | None = None,
) -> RideFlowResult:
    """Пассажир сел в машину: старт поездки (после «Прибыл»)."""
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    _assert_driver_owns(ride, driver_id=driver_id)

    if ride.status == RideRequestStatus.IN_PROGRESS:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if ride.status == RideRequestStatus.COMPLETED:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if RideRequestStatus.is_terminal(ride.status):
        raise RideFlowError("ride_closed", "Поездка отменена.", status_code=409)
    if ride.status not in (
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
    ):
        raise RideFlowError(
            "not_arrived",
            "Сначала отметьте «Прибыл» на точке подачи.",
            status_code=409,
        )

    previous_status = ride.status
    if ride.arrived_at is None:
        # Водитель пропустил шаг «Прибыл» — фиксируем прибытие и старт одним действием.
        ride.arrived_at = moment
    ride.status = RideRequestStatus.IN_PROGRESS
    ride.started_at = moment
    ride.status_updated_at = moment
    _clear_admin_attention(ride)

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=ride.status,
        actor_type=RideStatusActorType.DRIVER,
        actor_id=driver_id,
    )
    await _system_message(db_session, ride=ride, key="started")
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.STARTED,
        payload_extra={"startedAt": _iso(moment)},
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.STARTED,
        telegram_targets=["passenger"],
    )


async def _mark_ride_completed(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    actor_type: str,
    actor_id: str | None,
    moment: datetime,
    payload: dict | None = None,
) -> str:
    """Общий финал поездки — и для кнопки водителя, и для ответа пассажира «Да».

    Возвращает предыдущий статус: он нужен вызывающей стороне для уведомлений.
    """
    previous_status = ride.status
    ride.status = RideRequestStatus.COMPLETED
    ride.completed_at = moment
    ride.status_updated_at = moment
    _clear_admin_attention(ride)
    # Вопрос «Поездка состоялась?» больше не актуален — убираем кнопки [Да]/[Нет],
    # иначе пассажир увидит «мёртвую» карточку после закрытия поездки.
    await ride_notification_service.dismiss_completion_check(db_session, ride=ride)

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=ride.status,
        actor_type=actor_type,
        actor_id=actor_id,
        payload=payload,
    )
    await _system_message(db_session, ride=ride, key="completed")
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.COMPLETED,
        payload_extra={"completedAt": _iso(moment)},
    )
    return previous_status


async def complete_ride(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    now: datetime | None = None,
) -> RideFlowResult:
    """Поездка завершена: освобождаем машину, закрываем чат для новых сообщений."""
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    _assert_driver_owns(ride, driver_id=driver_id)

    if ride.status == RideRequestStatus.COMPLETED:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if RideRequestStatus.is_terminal(ride.status):
        raise RideFlowError("ride_closed", "Поездка отменена.", status_code=409)
    if ride.status != RideRequestStatus.IN_PROGRESS:
        raise RideFlowError(
            "not_started",
            "Сначала начните поездку — завершить можно только начатую.",
            status_code=409,
        )

    previous_status = await _mark_ride_completed(
        db_session,
        ride=ride,
        actor_type=RideStatusActorType.DRIVER,
        actor_id=driver_id,
        moment=moment,
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.COMPLETED,
        telegram_targets=["passenger"],
    )


async def request_completion_confirmation(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    now: datetime | None = None,
    force: bool = False,
    commit: bool = True,
) -> RideFlowResult:
    """Спрашиваем пассажира: «Поездка состоялась?» — с кнопками [Да]/[Нет].

    Зачем: водитель нажал «Начал поездку» и не нажал «Завершил». Пассажир видит
    «в пути» бесконечно, а статус и расчёты не двигаются. Через 2× расчётного времени
    в пути система спрашивает пассажира сама — без звонков и переписок.

    ``commit=False`` нужен сторожу: он накапливает изменения по многим поездкам и
    коммитит их одним махом, а Telegram уходит после коммита.
    """
    moment = _as_aware(now) or _now()
    if ride.status != RideRequestStatus.IN_PROGRESS:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if ride.completion_check_answered_at is not None:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if ride.completion_check_at is not None and not force:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)

    started_at = _as_aware(ride.started_at)
    elapsed_minutes = int((moment - started_at).total_seconds() // 60) if started_at else 0
    delay, expected, source = completion_check_delay_minutes(ride)
    ride.completion_check_at = moment

    await _system_message(db_session, ride=ride, key="completion_check", values={"minutes": delay})
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.COMPLETION_CHECK,
        extra={
            "elapsed_minutes": elapsed_minutes,
            "expected_minutes": int(expected),
            "check_minutes": delay,
        },
        payload_extra={
            "requiresConfirmation": True,
            "confirmationKind": "ride_completed",
            "rideId": ride.id,
            "expectedMinutes": int(expected),
            "estimationSource": source,
            "checkAfterMinutes": delay,
            "elapsedMinutes": elapsed_minutes,
            "startedAt": _iso(started_at),
            "dueAt": _iso(moment),
        },
    )

    if commit:
        await db_session.commit()
        await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=ride.status,
        changed=True,
        event=RideEvent.COMPLETION_CHECK,
        extra={"expectedMinutes": int(expected), "estimationSource": source},
        telegram_targets=["passenger"],
    )


def _completion_check_age_minutes(ride: RideRequest, *, now: datetime) -> int:
    check_at = _as_aware(ride.completion_check_at)
    if check_at is None:
        return 0
    return max(0, int((now - check_at).total_seconds() // 60))


async def confirm_ride_completion(
    db_session: AsyncSession,
    *,
    ride_id: str,
    user_id: str,
    completed: bool,
    now: datetime | None = None,
) -> RideFlowResult:
    """Ответ пассажира на вопрос «Поездка состоялась?».

    «Да» — закрываем поездку (водитель просто забыл нажать кнопку); водитель видит
    это в кабинете и Telegram.
    «Нет» — поездка остаётся «в пути», но уходит администратору: спорный случай
    разбирает человек, а не «зависший» статус.
    """
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None or ride.passenger_id != user_id:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    if RideRequestStatus.is_terminal(ride.status):
        raise RideFlowError("ride_closed", "Поездка уже закрыта.", status_code=409)
    if ride.status != RideRequestStatus.IN_PROGRESS:
        raise RideFlowError(
            "not_in_progress",
            "Поездка ещё не началась — отвечать на вопрос не нужно.",
            status_code=409,
        )
    if ride.completion_check_answered_at is not None:
        # Идемпотентность: повторный клик (или ответ из Telegram после приложения) безопасен.
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)

    ride.completion_check_at = ride.completion_check_at or moment
    ride.completion_check_answered_at = moment
    ride.completion_check_result = COMPLETION_CONFIRMED if completed else COMPLETION_DECLINED
    await ride_notification_service.dismiss_completion_check(db_session, ride=ride)

    if completed:
        previous_status = await _mark_ride_completed(
            db_session,
            ride=ride,
            actor_type=RideStatusActorType.PASSENGER,
            actor_id=user_id,
            moment=moment,
            payload={"confirmation": COMPLETION_CONFIRMED, "confirmedBy": "passenger"},
        )
        await ride_notification_service.notify_driver_for_ride_event(
            db_session,
            ride=ride,
            event=RideEvent.COMPLETED,
            extra={"confirmed_by_passenger": True},
        )
        await db_session.commit()
        await db_session.refresh(ride)
        return RideFlowResult(
            ride=ride,
            previous_status=previous_status,
            changed=True,
            event=RideEvent.COMPLETED,
            extra={"completedBy": "passenger"},
            telegram_targets=["passenger", "driver"],
        )

    _flag_admin_attention(
        ride,
        reason=RideAdminAttentionReason.PASSENGER_NOT_COMPLETED,
        now=moment,
    )
    await _system_message(db_session, ride=ride, key="completion_declined")
    await ride_notification_service.notify_driver_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.COMPLETION_DECLINED,
    )
    await ride_notification_service.notify_admins_ride_attention(
        db_session,
        ride=ride,
        reason=RideAdminAttentionReason.PASSENGER_NOT_COMPLETED,
        extra={"checkedMinutes": _completion_check_age_minutes(ride, now=moment)},
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=ride.status,
        changed=True,
        event=RideEvent.COMPLETION_DECLINED,
        extra={"passengerDeclined": True},
        telegram_targets=["driver"],
    )


_UNDO_TARGET: dict[str, str] = {
    RideRequestStatus.AWAITING_PASSENGER: RideRequestStatus.EN_ROUTE_TO_PICKUP,
    RideRequestStatus.IN_PROGRESS: RideRequestStatus.AWAITING_PASSENGER,
}


async def undo_last_status(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    now: datetime | None = None,
) -> RideFlowResult:
    """Откат ошибочно нажатого статуса («Прибыл» / «Начал поездку») в коротком окне.

    Зачем: водитель нажимает кнопки одной рукой в машине, промахи случаются.
    Окно ограничено, чтобы откат нельзя было использовать как обман пассажира.
    """
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    _assert_driver_owns(ride, driver_id=driver_id)
    _assert_not_terminal(ride)

    target = _UNDO_TARGET.get(ride.status)
    if target is None:
        raise RideFlowError(
            "nothing_to_undo",
            "Откатывать нечего: у поездки нет предыдущего шага.",
            status_code=409,
        )

    updated_at = _as_aware(ride.status_updated_at)
    window = _minutes(settings.ride_status_undo_window_minutes)
    if updated_at is None or moment - updated_at > window:
        raise RideFlowError(
            "undo_window_expired",
            f"Откат доступен только {settings.ride_status_undo_window_minutes} мин после отметки.",
            status_code=409,
            extra={"undoWindowMinutes": settings.ride_status_undo_window_minutes},
        )

    previous_status = ride.status
    ride.status = target
    ride.status_updated_at = moment
    if target == RideRequestStatus.EN_ROUTE_TO_PICKUP:
        ride.arrived_at = None
    if target == RideRequestStatus.AWAITING_PASSENGER:
        ride.started_at = None

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=target,
        actor_type=RideStatusActorType.DRIVER,
        actor_id=driver_id,
        reason_code="driver_undo",
    )
    await _system_message(
        db_session,
        ride=ride,
        key="undo",
        values={"status": _status_label(target, "lt")},
    )
    # Пассажиру — только в приложение: поездка не «поехала назад», просто поправлен шаг.
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.STATUS_UNDO,
        payload_extra={"correctedStatus": target},
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.STATUS_UNDO,
        extra={"status": target},
    )


async def _cancel_reason_text(db_session: AsyncSession, *, ride: RideRequest, reason_code: str) -> str:
    lang = await _passenger_language(db_session, passenger_id=ride.passenger_id) or "lt"
    return t(f"notif.ride.cancel_reason.{reason_code}", lang)


async def cancel_by_passenger(
    db_session: AsyncSession,
    *,
    ride_id: str,
    user_id: str,
    comment: str | None = None,
    now: datetime | None = None,
) -> RideFlowResult:
    """Пассажир отменил поездку.

    Пока водитель не приехал — обычная отмена. Когда водитель уже едет/ждёт — отмена «поздняя»:
    водителю компенсируется время, событие помечается для админа.
    """
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None or ride.passenger_id != user_id:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)

    if ride.status == RideRequestStatus.COMPLETED:
        raise RideFlowError("ride_closed", "Поездка уже завершена.", status_code=409)
    if ride.status == RideRequestStatus.CANCELLED:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if ride.status == RideRequestStatus.IN_PROGRESS:
        raise RideFlowError(
            "ride_started",
            "Поездка уже началась. Свяжитесь с водителем в чате.",
            status_code=409,
        )

    late = ride.status in (
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
    )
    reason_code = (
        RideCancelReason.PASSENGER_LATE_CANCELLED if late else RideCancelReason.PASSENGER_CANCELLED
    )
    previous_status = ride.status
    ride.status = RideRequestStatus.CANCELLED
    ride.cancelled_at = moment
    ride.cancelled_by = RideStatusActorType.PASSENGER
    ride.cancel_reason = reason_code
    ride.cancel_comment = (comment or "").strip() or None
    ride.status_updated_at = moment

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=ride.status,
        actor_type=RideStatusActorType.PASSENGER,
        actor_id=user_id,
        reason_code=reason_code,
        payload={"late": late, "comment": ride.cancel_comment},
    )
    await _system_message(db_session, ride=ride, key="cancelled")
    await ride_notification_service.notify_driver_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.CANCELLED,
        extra={"late": late},
        payload_extra={"late": late, "reason": reason_code},
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.CANCELLED,
        extra={"late": late, "reason": reason_code},
        telegram_targets=["driver"],
    )


async def cancel_by_driver(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    reason_code: str = RideCancelReason.DRIVER_CANCELLED,
    comment: str | None = None,
    now: datetime | None = None,
) -> RideFlowResult:
    """Водитель отменяет поездку или фиксирует неявку пассажира.

    Неявку нельзя оформить мгновенно: нужно отметить «Прибыл» и подождать минимальное время
    (`ride_no_show_min_wait_minutes`) — так пассажир защищён от «уехал через 10 секунд».
    """
    if reason_code not in RideCancelReason.ALL:
        raise RideFlowError("invalid_reason", "Неизвестная причина отмены.")
    if reason_code == RideCancelReason.ADMIN_CANCELLED:
        raise RideFlowError("invalid_reason", "Эта причина доступна только администратору.")

    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    _assert_driver_owns(ride, driver_id=driver_id)

    if ride.status == RideRequestStatus.CANCELLED:
        return RideFlowResult(ride=ride, previous_status=ride.status, changed=False)
    if ride.status == RideRequestStatus.COMPLETED:
        raise RideFlowError("ride_closed", "Поездка уже завершена.", status_code=409)
    if ride.status == RideRequestStatus.IN_PROGRESS:
        raise RideFlowError(
            "ride_started",
            "Поездка уже началась: завершите её или свяжитесь с администратором.",
            status_code=409,
        )
    if ride.status not in RideRequestStatus.DRIVER_CANCELLABLE:
        raise RideFlowError("not_allowed", "Поездку нельзя отменить в текущем статусе.", status_code=409)

    if reason_code == RideCancelReason.DRIVER_NO_SHOW:
        arrived_at = _as_aware(ride.arrived_at)
        if arrived_at is None:
            raise RideFlowError(
                "no_show_not_arrived",
                "Сначала отметьте «Прибыл» на точке подачи.",
                status_code=409,
            )
        min_wait = _minutes(settings.ride_no_show_min_wait_minutes)
        waited = moment - arrived_at
        if waited < min_wait:
            raise RideFlowError(
                "no_show_too_early",
                f"Неявку можно оформить после {settings.ride_no_show_min_wait_minutes} мин ожидания.",
                status_code=409,
                extra={
                    "availableInSeconds": int((min_wait - waited).total_seconds()),
                    "minWaitMinutes": settings.ride_no_show_min_wait_minutes,
                },
            )

    previous_status = ride.status
    ride.status = RideRequestStatus.CANCELLED
    ride.cancelled_at = moment
    ride.cancelled_by = RideStatusActorType.DRIVER
    ride.cancel_reason = reason_code
    ride.cancel_comment = (comment or "").strip() or None
    ride.status_updated_at = moment

    is_no_show = reason_code == RideCancelReason.DRIVER_NO_SHOW
    if is_no_show:
        _flag_admin_attention(ride, reason=RideAdminAttentionReason.NO_SHOW, now=moment)

    await _record_event(
        db_session,
        ride=ride,
        from_status=previous_status,
        to_status=ride.status,
        actor_type=RideStatusActorType.DRIVER,
        actor_id=driver_id,
        reason_code=reason_code,
        payload={"comment": ride.cancel_comment},
    )
    await _system_message(db_session, ride=ride, key="no_show" if is_no_show else "cancelled")

    reason_text = await _cancel_reason_text(db_session, ride=ride, reason_code=reason_code)
    await ride_notification_service.notify_passenger_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.NO_SHOW if is_no_show else RideEvent.CANCELLED,
        extra={"reason": reason_text},
        payload_extra={"reason": reason_code, "late": False},
    )
    if is_no_show:
        await ride_notification_service.notify_admins_ride_attention(
            db_session,
            ride=ride,
            reason=RideAdminAttentionReason.NO_SHOW,
            extra={"reason": reason_code},
        )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=previous_status,
        changed=True,
        event=RideEvent.NO_SHOW if is_no_show else RideEvent.CANCELLED,
        extra={"reason": reason_code},
        telegram_targets=["passenger"],
    )


async def _quick_text(db_session: AsyncSession, *, ride: RideRequest, key: str) -> str:
    """Текст быстрого ответа на языке пассажира (в чате фронт всё равно рисует свой перевод)."""
    lang = await _passenger_language(db_session, passenger_id=ride.passenger_id) or "lt"
    return t(f"notif.ride.system.{key}", lang)


async def mark_passenger_ready(
    db_session: AsyncSession,
    *,
    ride_id: str,
    user_id: str,
    now: datetime | None = None,
) -> RideFlowResult:
    """Пассажир нажал «Я на месте»: водитель видит это в приложении, чате и Telegram."""
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None or ride.passenger_id != user_id:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    if RideRequestStatus.is_terminal(ride.status):
        raise RideFlowError("ride_closed", "Поездка уже завершена или отменена.", status_code=409)
    if ride.status not in (
        RideRequestStatus.ASSIGNED,
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
    ):
        raise RideFlowError(
            "not_allowed",
            "Отметка «Я на месте» доступна до начала поездки.",
            status_code=409,
        )

    ride.passenger_ready_at = moment
    await db_session.flush()

    await ride_chat_service.post_message(
        db_session,
        ride=ride,
        sender=ride_chat_service.RideChatSender(
            type="passenger",
            id=user_id,
            name=ride.passenger_name,
        ),
        body=await _quick_text(db_session, ride=ride, key="ready"),
        kind=RideChatMessageKind.QUICK_REPLY,
        payload={"kind": "quick", "quick": "ready"},
    )
    await ride_notification_service.notify_driver_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.PASSENGER_READY,
        payload_extra={"passengerReadyAt": _iso(moment)},
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=ride.status,
        changed=True,
        event=RideEvent.PASSENGER_READY,
        telegram_targets=["driver"],
    )


async def nudge_driver(
    db_session: AsyncSession,
    *,
    ride_id: str,
    user_id: str,
    now: datetime | None = None,
) -> RideFlowResult:
    """Пассажир спрашивает «Где вы?» — пинг водителю с кулдауном против спама."""
    moment = _as_aware(now) or _now()
    ride = await lock_ride(db_session, ride_id=ride_id)
    if ride is None or ride.passenger_id != user_id:
        raise RideFlowError("not_found", "Поездка не найдена.", status_code=404)
    if ride.status not in (
        RideRequestStatus.ASSIGNED,
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
    ):
        raise RideFlowError(
            "not_allowed",
            "Напомнить водителю можно только до начала поездки.",
            status_code=409,
        )

    cooldown = timedelta(seconds=max(0, int(settings.ride_nudge_cooldown_seconds)))
    sent_at = _as_aware(ride.nudge_sent_at)
    if sent_at is not None and moment - sent_at < cooldown:
        raise RideFlowError(
            "nudge_cooldown",
            "Вы уже напомнили водителю. Попробуйте чуть позже.",
            status_code=429,
            extra={"retryAfterSeconds": int((cooldown - (moment - sent_at)).total_seconds())},
        )

    ride.nudge_sent_at = moment
    await db_session.flush()

    await ride_chat_service.post_message(
        db_session,
        ride=ride,
        sender=ride_chat_service.RideChatSender(
            type="passenger",
            id=user_id,
            name=ride.passenger_name,
        ),
        body=await _quick_text(db_session, ride=ride, key="nudge"),
        kind=RideChatMessageKind.QUICK_REPLY,
        payload={"kind": "quick", "quick": "where_are_you"},
    )
    await ride_notification_service.notify_driver_for_ride_event(
        db_session,
        ride=ride,
        event=RideEvent.PASSENGER_NUDGE,
    )
    await db_session.commit()
    await db_session.refresh(ride)

    return RideFlowResult(
        ride=ride,
        previous_status=ride.status,
        changed=True,
        event=RideEvent.PASSENGER_NUDGE,
        telegram_targets=["driver"],
    )


def undo_seconds_left(ride: RideRequest, *, now: datetime | None = None) -> int:
    """Сколько секунд осталось на откат статуса (0 — откат недоступен)."""
    if ride.status not in _UNDO_TARGET:
        return 0
    updated_at = _as_aware(ride.status_updated_at)
    if updated_at is None:
        return 0
    moment = _as_aware(now) or _now()
    window = _minutes(settings.ride_status_undo_window_minutes)
    remaining = (updated_at + window) - moment
    return max(0, int(remaining.total_seconds()))


def no_show_seconds_left(ride: RideRequest, *, now: datetime | None = None) -> int:
    """Через сколько секунд водитель сможет оформить неявку (0 — уже можно)."""
    arrived_at = _as_aware(ride.arrived_at)
    if arrived_at is None:
        return 0
    moment = _as_aware(now) or _now()
    min_wait = _minutes(settings.ride_no_show_min_wait_minutes)
    remaining = (arrived_at + min_wait) - moment
    return max(0, int(remaining.total_seconds()))


def driver_flow_state(ride: RideRequest, *, now: datetime | None = None) -> dict:
    """Что водителю доступно по этой поездке: кнопки, таймеры и подсказки для UI.

    Фронт рисует именно это состояние, чтобы не было «мёртвых» кнопок и ложных надежд.
    """
    moment = _as_aware(now) or _now()
    status = ride.status
    arrived_at = _as_aware(ride.arrived_at)
    waiting_seconds = int((moment - arrived_at).total_seconds()) if arrived_at else 0
    no_show_left = no_show_seconds_left(ride, now=moment)

    can_en_route = status == RideRequestStatus.ASSIGNED
    can_arrived = status in (RideRequestStatus.ASSIGNED, RideRequestStatus.EN_ROUTE_TO_PICKUP)
    can_start = status in (RideRequestStatus.EN_ROUTE_TO_PICKUP, RideRequestStatus.AWAITING_PASSENGER)
    can_complete = status == RideRequestStatus.IN_PROGRESS
    can_cancel = status in RideRequestStatus.DRIVER_CANCELLABLE
    can_no_show = (
        status == RideRequestStatus.AWAITING_PASSENGER
        and arrived_at is not None
        and no_show_left == 0
    )

    can_en_route_at: str | None = None
    if can_en_route:
        ride_dt = _as_aware(ride.date_time)
        if ride_dt is not None:
            earliest = ride_dt - _minutes(settings.ride_en_route_max_early_minutes)
            if moment < earliest:
                can_en_route = False
                can_arrived = False
                can_en_route_at = _iso(earliest)

    return {
        "status": status,
        "canEnRoute": can_en_route,
        "canArrived": can_arrived,
        "canStart": can_start,
        "canComplete": can_complete,
        "canCancel": can_cancel,
        "canReportNoShow": can_no_show,
        "canUndo": undo_seconds_left(ride, now=moment) > 0,
        "undoSecondsLeft": undo_seconds_left(ride, now=moment),
        "noShowSecondsLeft": no_show_left,
        "enRouteAt": _iso(ride.en_route_at),
        "arrivedAt": _iso(arrived_at),
        "startedAt": _iso(ride.started_at),
        "waitingSeconds": waiting_seconds,
        "passengerReady": ride.passenger_ready_at is not None,
        "passengerReadyAt": _iso(ride.passenger_ready_at),
        "canEnRouteAt": can_en_route_at,
        "requiresAdminAttention": ride.admin_attention_at is not None,
        "adminAttentionReason": ride.admin_attention_reason,
    }


def passenger_flow_state(ride: RideRequest, *, now: datetime | None = None) -> dict:
    """Что пассажиру доступно: чат, «я на месте», «где вы?», отмена и ожидание."""
    moment = _as_aware(now) or _now()
    arrived_at = _as_aware(ride.arrived_at)
    waiting_seconds = int((moment - arrived_at).total_seconds()) if arrived_at else 0
    can_cancel = not RideRequestStatus.is_terminal(ride.status) and (
        ride.status != RideRequestStatus.IN_PROGRESS
    )
    nudge_sent_at = _as_aware(ride.nudge_sent_at)
    nudge_cooldown = timedelta(seconds=max(0, int(settings.ride_nudge_cooldown_seconds)))
    nudge_left = 0
    if nudge_sent_at is not None:
        left = (nudge_sent_at + nudge_cooldown) - moment
        nudge_left = max(0, int(left.total_seconds()))

    state = {
        "status": ride.status,
        "canChat": ride.status in RideRequestStatus.CHAT_OPEN or ride.status in RideRequestStatus.TERMINAL,
        "canSendMessage": ride.status in RideRequestStatus.CHAT_OPEN,
        "canMarkReady": ride.status
        in (
            RideRequestStatus.ASSIGNED,
            RideRequestStatus.EN_ROUTE_TO_PICKUP,
            RideRequestStatus.AWAITING_PASSENGER,
        ),
        "passengerReady": ride.passenger_ready_at is not None,
        "canNudgeDriver": ride.status
        in (
            RideRequestStatus.ASSIGNED,
            RideRequestStatus.EN_ROUTE_TO_PICKUP,
            RideRequestStatus.AWAITING_PASSENGER,
        ),
        "nudgeSecondsLeft": nudge_left,
        "canCancel": can_cancel,
        "lateCancel": ride.status
        in (RideRequestStatus.EN_ROUTE_TO_PICKUP, RideRequestStatus.AWAITING_PASSENGER),
        "enRouteAt": _iso(ride.en_route_at),
        "arrivedAt": _iso(arrived_at),
        "startedAt": _iso(ride.started_at),
        "waitingSeconds": waiting_seconds,
        "driverWaitingMinutes": settings.ride_wait_reminder_minutes,
        "cancelReason": ride.cancel_reason,
        "cancelComment": ride.cancel_comment,
    }
    # Вопрос «Поездка состоялась?» показываем и в карточке поездки, а не только в уведомлениях.
    state.update(completion_check_state(ride, now=moment))
    return state


WAIT_REMINDER_KEY = "wait_reminder"


async def run_watchdog(
    db_session: AsyncSession,
    *,
    now: datetime | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """Обход активных поездок: напоминания участникам и пометка спорных случаев для админа.

    Запускается фоном (см. lifespan) — именно он спасает от «зависших» статусов,
    когда водитель забыл нажать кнопку, а пассажир ждёт на улице. Здесь же рождается
    вопрос «Поездка состоялась?» для поездок, которые водитель не закрыл.

    Возвращает счётчики тика и список ``deliveries`` — поездки, для которых после
    коммита нужно отправить Telegram (например, вопрос с кнопками [Да]/[Нет]).
    """
    moment = _as_aware(now) or _now()
    counters: dict[str, Any] = {
        "scanned": 0,
        "wait_reminders": 0,
        "no_show_available": 0,
        "driver_late": 0,
        "en_route_stuck": 0,
        "ride_stuck": 0,
        "completion_checks": 0,
        "completion_escalations": 0,
        "admin_flags": 0,
        # Поездки, по которым после коммита нужно отправить Telegram (в т.ч. кнопки [Да]/[Нет]).
        "deliveries": [],
    }

    result = await db_session.execute(
        select(RideRequest)
        .where(RideRequest.status.in_(RideRequestStatus.ACTIVE))
        .limit(max(1, limit))
        .with_for_update(skip_locked=True)
    )
    rides = list(result.scalars().all())
    counters["scanned"] = len(rides)

    for ride in rides:
        try:
            await _watchdog_tick_ride(db_session, ride=ride, now=moment, counters=counters)
        except Exception:  # noqa: BLE001
            logger.exception("Ride watchdog failed for ride %s", ride.id)

    await db_session.commit()
    return counters


async def _watchdog_tick_ride(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    now: datetime,
    counters: dict[str, int],
) -> None:
    """Правила «поездка застряла» для одной заявки. Все они одноразовые (флаги в БД)."""
    status = ride.status
    arrived_at = _as_aware(ride.arrived_at)

    if status == RideRequestStatus.AWAITING_PASSENGER and arrived_at is not None:
        waited = now - arrived_at
        reminder_after = _minutes(settings.ride_wait_reminder_minutes)

        if ride.arrival_reminder_sent_at is None and waited >= reminder_after:
            ride.arrival_reminder_sent_at = now
            await _system_message(
                db_session,
                ride=ride,
                key="wait_reminder",
                values={"minutes": settings.ride_wait_reminder_minutes},
            )
            await ride_notification_service.notify_passenger_for_ride_event(
                db_session,
                ride=ride,
                event=RideEvent.WAIT_REMINDER,
                extra={"minutes": settings.ride_wait_reminder_minutes},
            )
            counters["wait_reminders"] += 1

        if ride.no_show_available_notified_at is None and no_show_seconds_left(ride, now=now) == 0:
            ride.no_show_available_notified_at = now
            await ride_notification_service.notify_driver_for_ride_event(
                db_session,
                ride=ride,
                event=RideEvent.NO_SHOW_AVAILABLE,
                extra={"minWaitMinutes": settings.ride_no_show_min_wait_minutes},
            )
            counters["no_show_available"] += 1

        attention_after = _minutes(max(settings.ride_wait_reminder_minutes * 2, 15))
        if waited >= attention_after and _flag_admin_attention(
            ride,
            reason=RideAdminAttentionReason.WAITING_TOO_LONG,
            now=now,
        ):
            await ride_notification_service.notify_admins_ride_attention(
                db_session,
                ride=ride,
                reason=RideAdminAttentionReason.WAITING_TOO_LONG,
                extra={"waitingMinutes": int(waited.total_seconds() // 60)},
            )
            counters["admin_flags"] += 1

    if status == RideRequestStatus.ASSIGNED:
        ride_dt = _as_aware(ride.date_time)
        late_after = _minutes(settings.ride_driver_late_reminder_minutes)
        if (
            ride_dt is not None
            and now >= ride_dt + late_after
            and ride.driver_late_reminded_at is None
        ):
            ride.driver_late_reminded_at = now
            await ride_notification_service.notify_driver_for_ride_event(
                db_session,
                ride=ride,
                event=RideEvent.DRIVER_LATE,
                extra={"lateMinutes": int((now - ride_dt).total_seconds() // 60)},
            )
            counters["driver_late"] += 1
            if _flag_admin_attention(
                ride,
                reason=RideAdminAttentionReason.DRIVER_LATE,
                now=now,
            ):
                await ride_notification_service.notify_admins_ride_attention(
                    db_session,
                    ride=ride,
                    reason=RideAdminAttentionReason.DRIVER_LATE,
                    extra={"lateMinutes": int((now - ride_dt).total_seconds() // 60)},
                )
                counters["admin_flags"] += 1

    if status == RideRequestStatus.EN_ROUTE_TO_PICKUP:
        en_route_at = _as_aware(ride.en_route_at)
        timeout = _minutes(settings.ride_en_route_timeout_minutes)
        if en_route_at is not None and now - en_route_at >= timeout:
            if _flag_admin_attention(
                ride,
                reason=RideAdminAttentionReason.EN_ROUTE_TOO_LONG,
                now=now,
            ):
                counters["en_route_stuck"] += 1
                counters["admin_flags"] += 1
                await ride_notification_service.notify_driver_for_ride_event(
                    db_session,
                    ride=ride,
                    event=RideEvent.EN_ROUTE_STUCK,
                )
                await ride_notification_service.notify_admins_ride_attention(
                    db_session,
                    ride=ride,
                    reason=RideAdminAttentionReason.EN_ROUTE_TOO_LONG,
                    extra={"enRouteMinutes": int((now - en_route_at).total_seconds() // 60)},
                )

    if status == RideRequestStatus.IN_PROGRESS:
        started_at = _as_aware(ride.started_at)
        max_duration = _minutes(settings.ride_max_duration_minutes)
        if started_at is not None and now - started_at >= max_duration:
            if _flag_admin_attention(
                ride,
                reason=RideAdminAttentionReason.RIDE_TOO_LONG,
                now=now,
            ):
                counters["ride_stuck"] += 1
                counters["admin_flags"] += 1
                await ride_notification_service.notify_driver_for_ride_event(
                    db_session,
                    ride=ride,
                    event=RideEvent.RIDE_STUCK,
                )
                await ride_notification_service.notify_admins_ride_attention(
                    db_session,
                    ride=ride,
                    reason=RideAdminAttentionReason.RIDE_TOO_LONG,
                    extra={"rideMinutes": int((now - started_at).total_seconds() // 60)},
                )

        # «Поездка состоялась?»: водитель начал и не завершил. Спрашиваем пассажира через
        # 2× расчётного времени в пути; если он молчит — подключаем администратора.
        if ride.completion_check_answered_at is None:
            due_at = completion_check_due_at(ride)
            if ride.completion_check_at is None and due_at is not None and now >= due_at:
                result = await request_completion_confirmation(
                    db_session,
                    ride=ride,
                    now=now,
                    commit=False,
                )
                if result.changed:
                    counters["completion_checks"] += 1
                    counters["deliveries"].append(result)
            elif ride.completion_check_at is not None:
                escalate_at = completion_check_escalate_at(ride)
                if escalate_at is not None and now >= escalate_at and _flag_admin_attention(
                    ride,
                    reason=RideAdminAttentionReason.COMPLETION_UNCONFIRMED,
                    now=now,
                ):
                    ride.completion_check_escalated_at = now
                    await ride_notification_service.notify_admins_ride_attention(
                        db_session,
                        ride=ride,
                        reason=RideAdminAttentionReason.COMPLETION_UNCONFIRMED,
                        extra={"checkedMinutes": _completion_check_age_minutes(ride, now=now)},
                    )
                    counters["completion_escalations"] += 1
                    counters["admin_flags"] += 1


__all__ = [
    "COMPLETION_CONFIRMED",
    "COMPLETION_DECLINED",
    "RideFlowError",
    "RideFlowResult",
    "cancel_by_driver",
    "cancel_by_passenger",
    "complete_ride",
    "completion_check_delay_minutes",
    "completion_check_due_at",
    "completion_check_state",
    "confirm_ride_completion",
    "driver_flow_state",
    "estimated_ride_duration_minutes",
    "haversine_meters",
    "lock_ride",
    "mark_arrived",
    "mark_en_route",
    "mark_passenger_ready",
    "no_show_seconds_left",
    "nudge_driver",
    "passenger_flow_state",
    "request_completion_confirmation",
    "run_watchdog",
    "start_ride",
    "undo_last_status",
    "undo_seconds_left",
]
