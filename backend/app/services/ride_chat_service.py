from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.driver import Driver
from app.models.ride_message import (
    RideChatMessage,
    RideChatMessageKind,
    RideChatParticipantType,
    RideChatReadState,
)
from app.models.ride_request import RideRequest, RideRequestStatus

logger = logging.getLogger(__name__)


class RideChatError(Exception):
    """Ошибка чата поездки: код и текст уходят в HTTP-ответ как {"code", "message"}."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


@dataclass(frozen=True)
class RideChatSender:
    type: str
    id: str | None
    name: str


def thread_key_for(ride: RideRequest) -> str:
    """Ключ чата: общий на всю машину (группа), иначе — на конкретную заявку."""
    group_id = (ride.group_id or "").strip()
    if group_id:
        return f"g:{group_id}"
    return f"r:{ride.id}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def can_send_in_ride(ride: RideRequest) -> tuple[bool, str | None]:
    """Пишем только пока поездка активна. После завершения/отмены чат остаётся читаемым."""
    if ride.status in RideRequestStatus.CHAT_OPEN:
        return True, None
    if ride.status in RideRequestStatus.TERMINAL:
        return False, "ride_closed"
    return False, "ride_not_assigned"


async def get_ride_for_passenger(
    db_session: AsyncSession,
    *,
    ride_id: str,
    user_id: str,
) -> RideRequest | None:
    result = await db_session.execute(
        select(RideRequest).where(
            RideRequest.id == ride_id,
            RideRequest.passenger_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_ride_for_driver(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
) -> RideRequest | None:
    result = await db_session.execute(
        select(RideRequest).where(
            RideRequest.id == ride_id,
            RideRequest.driver_id == driver_id,
        )
    )
    return result.scalar_one_or_none()


async def list_thread_ride_ids(db_session: AsyncSession, *, thread_key: str) -> list[str]:
    """Все заявки, попадающие в тот же чат (группа пассажиров одной машины)."""
    if thread_key.startswith("g:"):
        group_id = thread_key[2:]
        result = await db_session.execute(
            select(RideRequest.id).where(RideRequest.group_id == group_id)
        )
        return list(result.scalars().all())

    return [thread_key[2:]]


async def _resolve_driver_user_id(
    db_session: AsyncSession,
    *,
    driver_id: str | None,
) -> str | None:
    if not driver_id:
        return None
    result = await db_session.execute(select(Driver.user_id).where(Driver.id == driver_id))
    return result.scalar_one_or_none()


async def _participants_blocked(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    driver_user_id: str | None,
) -> bool:
    """Если водитель и пассажир заблокировали друг друга — писать в чат нельзя."""
    if not driver_user_id or not ride.passenger_id:
        return False
    from app.services.block_service import are_users_blocked

    return await are_users_blocked(
        db_session,
        user_a=driver_user_id,
        user_b=ride.passenger_id,
    )


async def _assert_can_post(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    sender: RideChatSender,
    body: str,
) -> None:
    text = body.strip()
    if not text:
        raise RideChatError("empty_message", "Сообщение не может быть пустым.")
    if len(text) > settings.ride_chat_max_length:
        raise RideChatError(
            "message_too_long",
            f"Сообщение длиннее {settings.ride_chat_max_length} символов.",
        )

    can_send, reason = can_send_in_ride(ride)
    if not can_send:
        if reason == "ride_closed":
            raise RideChatError(
                "ride_closed",
                "Чат закрыт: поездка завершена или отменена.",
                status_code=409,
            )
        raise RideChatError(
            "ride_not_active",
            "Чат откроется после назначения водителя.",
            status_code=409,
        )

    if sender.type != RideChatParticipantType.SYSTEM:
        driver_user_id = await _resolve_driver_user_id(db_session, driver_id=ride.driver_id)
        if await _participants_blocked(db_session, ride=ride, driver_user_id=driver_user_id):
            raise RideChatError(
                "blocked",
                "Обмен сообщениями недоступен из-за блокировки.",
                status_code=403,
            )

    window = max(1, int(settings.ride_chat_rate_limit_window_seconds))
    since = _now() - timedelta(seconds=window)
    counter = await db_session.execute(
        select(func.count())
        .select_from(RideChatMessage)
        .where(
            RideChatMessage.ride_id == ride.id,
            RideChatMessage.sender_type == sender.type,
            RideChatMessage.sender_id == (sender.id or ""),
            RideChatMessage.created_at >= since,
        )
    )
    sent = int(counter.scalar_one() or 0)
    limit = max(1, int(settings.ride_chat_rate_limit_messages))
    if sent >= limit:
        raise RideChatError(
            "rate_limited",
            "Слишком много сообщений подряд. Подождите немного.",
            status_code=429,
            retry_after=window,
        )


async def post_message(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    sender: RideChatSender,
    body: str,
    kind: str = RideChatMessageKind.TEXT,
    payload: dict | None = None,
) -> RideChatMessage:
    """Добавляет сообщение в чат поездки. Коммит — на вызывающей стороне."""
    await _assert_can_post(db_session, ride=ride, sender=sender, body=body)

    message = RideChatMessage(
        thread_key=thread_key_for(ride),
        ride_id=ride.id,
        sender_type=sender.type,
        sender_id=sender.id,
        sender_name=sender.name,
        kind=kind,
        body=body.strip(),
        payload=payload,
    )
    db_session.add(message)

    # Автор всегда считается прочитавшим своё сообщение.
    if sender.type != RideChatParticipantType.SYSTEM:
        await mark_read(
            db_session,
            thread_key=message.thread_key,
            reader_type=sender.type,
            reader_id=sender.id or "",
        )
    await db_session.flush()
    return message


async def post_system_message(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    body: str,
    payload: dict | None = None,
) -> RideChatMessage:
    """Системная запись в чат: статус поездки, неявка, отмена (это «история поездки»)."""
    message = RideChatMessage(
        thread_key=thread_key_for(ride),
        ride_id=ride.id,
        sender_type=RideChatParticipantType.SYSTEM,
        sender_id=None,
        sender_name="",
        kind=RideChatMessageKind.SYSTEM,
        body=body,
        payload=payload,
    )
    db_session.add(message)
    await db_session.flush()
    return message


async def list_messages(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    limit: int = 100,
    before: datetime | None = None,
) -> list[RideChatMessage]:
    """Сообщения треда в хронологическом порядке (последние `limit`)."""
    filters = [RideChatMessage.thread_key == thread_key_for(ride)]
    if before is not None:
        filters.append(RideChatMessage.created_at < before)
    result = await db_session.execute(
        select(RideChatMessage)
        .where(and_(*filters))
        .order_by(RideChatMessage.created_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    return list(reversed(result.scalars().all()))


async def _get_read_state(
    db_session: AsyncSession,
    *,
    thread_key: str,
    reader_type: str,
    reader_id: str,
) -> RideChatReadState | None:
    result = await db_session.execute(
        select(RideChatReadState).where(
            RideChatReadState.thread_key == thread_key,
            RideChatReadState.reader_type == reader_type,
            RideChatReadState.reader_id == reader_id,
        )
    )
    return result.scalar_one_or_none()


async def mark_read(
    db_session: AsyncSession,
    *,
    thread_key: str,
    reader_type: str,
    reader_id: str,
    up_to: datetime | None = None,
) -> RideChatReadState:
    """Отмечает тред прочитанным для участника (идемпотентно)."""
    if reader_type == RideChatParticipantType.SYSTEM:
        raise RideChatError("invalid_reader", "Системный участник не читает чат.")

    state = await _get_read_state(
        db_session,
        thread_key=thread_key,
        reader_type=reader_type,
        reader_id=reader_id,
    )
    moment = _as_aware(up_to) or _now()
    if state is None:
        state = RideChatReadState(
            thread_key=thread_key,
            reader_type=reader_type,
            reader_id=reader_id,
            last_read_at=moment,
        )
        db_session.add(state)
    else:
        current = _as_aware(state.last_read_at)
        if current is None or current < moment:
            state.last_read_at = moment
    await db_session.flush()
    return state


async def count_unread(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    reader_type: str,
    reader_id: str,
) -> int:
    """Сколько сообщений собеседников и системы участник ещё не читал."""
    thread_key = thread_key_for(ride)
    state = await _get_read_state(
        db_session,
        thread_key=thread_key,
        reader_type=reader_type,
        reader_id=reader_id,
    )
    filters = [
        RideChatMessage.thread_key == thread_key,
        # Непрочитанным считаем всё, что писал не сам участник:
        # сообщения собеседников, попутчиков и системные записи о статусах.
        or_(
            RideChatMessage.sender_type != reader_type,
            func.coalesce(RideChatMessage.sender_id, "") != reader_id,
        ),
    ]
    read_moment = _as_aware(state.last_read_at) if state is not None else None
    if read_moment is not None:
        filters.append(RideChatMessage.created_at > read_moment)
    result = await db_session.execute(
        select(func.count()).select_from(RideChatMessage).where(and_(*filters))
    )
    return int(result.scalar_one() or 0)


async def unread_counts_for_passenger(
    db_session: AsyncSession,
    *,
    user_id: str,
    rides: list[RideRequest],
) -> dict[str, int]:
    """Непрочитанные по каждой поездке пассажира — для бейджей в списке заявок.

    Считается двумя запросами на весь список, чтобы не устраивать N+1.
    """
    if not rides:
        return {}

    thread_keys = {thread_key_for(ride) for ride in rides}
    states_result = await db_session.execute(
        select(RideChatReadState).where(
            RideChatReadState.reader_type == RideChatParticipantType.PASSENGER,
            RideChatReadState.reader_id == user_id,
            RideChatReadState.thread_key.in_(thread_keys),
        )
    )
    last_read: dict[str, datetime | None] = {
        state.thread_key: _as_aware(state.last_read_at)
        for state in states_result.scalars().all()
    }

    messages_result = await db_session.execute(
        select(RideChatMessage.thread_key, RideChatMessage.created_at).where(
            RideChatMessage.thread_key.in_(thread_keys),
            or_(
                RideChatMessage.sender_type != RideChatParticipantType.PASSENGER,
                func.coalesce(RideChatMessage.sender_id, "") != user_id,
            ),
        )
    )
    unread: dict[str, int] = {key: 0 for key in thread_keys}
    for thread_key, created_at in messages_result.all():
        moment = _as_aware(created_at)
        read_moment = last_read.get(thread_key)
        if read_moment is None or (moment is not None and moment > read_moment):
            unread[thread_key] = unread.get(thread_key, 0) + 1

    return {ride.id: unread.get(thread_key_for(ride), 0) for ride in rides}


async def last_message_at(db_session: AsyncSession, *, ride: RideRequest) -> datetime | None:
    result = await db_session.execute(
        select(func.max(RideChatMessage.created_at)).where(
            RideChatMessage.thread_key == thread_key_for(ride)
        )
    )
    return _as_aware(result.scalar_one_or_none())


async def list_other_participant_ride_ids(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
) -> list[str]:
    """Заявки того же треда без указанной — для веера уведомлений попутчикам."""
    ride_ids = await list_thread_ride_ids(db_session, thread_key=thread_key_for(ride))
    return [item for item in ride_ids if item != ride.id]


async def peer_last_read_at(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    reader_type: str,
) -> datetime | None:
    """Когда собеседники последний раз читали тред — для галочек «прочитано».

    Пассажиру показываем, прочитал ли водитель; водителю — прочитали ли все попутчики
    (берём минимальную отметку: пока хоть один не прочитал, галочка не появляется).
    """
    thread_key = thread_key_for(ride)
    if reader_type == RideChatParticipantType.PASSENGER:
        state = await _get_read_state(
            db_session,
            thread_key=thread_key,
            reader_type=RideChatParticipantType.DRIVER,
            reader_id=ride.driver_id or "",
        )
        return _as_aware(state.last_read_at) if state else None

    ride_ids = await list_thread_ride_ids(db_session, thread_key=thread_key)
    if not ride_ids:
        return None
    passenger_ids_result = await db_session.execute(
        select(RideRequest.passenger_id).where(RideRequest.id.in_(ride_ids))
    )
    passenger_ids = [row for row in passenger_ids_result.scalars().all() if row]
    if not passenger_ids:
        return None
    states_result = await db_session.execute(
        select(RideChatReadState).where(
            RideChatReadState.thread_key == thread_key,
            RideChatReadState.reader_type == RideChatParticipantType.PASSENGER,
            RideChatReadState.reader_id.in_(passenger_ids),
        )
    )
    states = list(states_result.scalars().all())
    if len(states) < len(passenger_ids):
        return None
    moments = [_as_aware(state.last_read_at) for state in states]
    if any(moment is None for moment in moments):
        return None
    return min(moment for moment in moments if moment is not None)


async def unread_counts_for_driver(
    db_session: AsyncSession,
    *,
    driver_id: str,
    rides: list[RideRequest],
) -> int:
    """Суммарное число непрочитанных сообщений по всем поездкам водителя (для бейджа)."""
    if not rides:
        return 0
    total = 0
    for ride in rides:
        if ride.status not in RideRequestStatus.CHAT_OPEN:
            continue
        total += await count_unread(
            db_session,
            ride=ride,
            reader_type=RideChatParticipantType.DRIVER,
            reader_id=driver_id,
        )
    return total


__all__ = [
    "RideChatError",
    "RideChatSender",
    "can_send_in_ride",
    "count_unread",
    "get_ride_for_driver",
    "get_ride_for_passenger",
    "last_message_at",
    "list_messages",
    "list_other_participant_ride_ids",
    "list_thread_ride_ids",
    "mark_read",
    "peer_last_read_at",
    "post_message",
    "post_system_message",
    "thread_key_for",
    "unread_counts_for_driver",
    "unread_counts_for_passenger",
]
