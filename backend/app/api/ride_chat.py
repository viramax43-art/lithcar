from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_roles
from app.core.dependencies import get_db_session
from app.models.user import User, UserRole
from app.schemas.notification import UnreadCountOut
from app.schemas.ride_chat import (
    RideChatPageOut,
    RideChatParticipantOut,
    RideChatSendIn,
    build_chat_page,
)
from app.services import ride_chat_service, ride_flow_side_effects, ride_status_service
from app.services.driver_service import get_driver
from app.services.ride_chat_service import RideChatError
from app.services.ride_status_service import RideFlowError

router = APIRouter(prefix="/rides")

_PASSENGER_RIDE_ROLES = (
    UserRole.PASSENGER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.MODERATOR,
)

DEFAULT_CHAT_LIMIT = 100


class RidePassengerFlowOut(BaseModel):
    """Что пассажиру доступно по поездке: чат, «я на месте», «где вы?», отмена."""

    rideId: str
    status: str
    canChat: bool
    canSendMessage: bool
    canMarkReady: bool
    passengerReady: bool
    canNudgeDriver: bool
    nudgeSecondsLeft: int
    canCancel: bool
    lateCancel: bool
    enRouteAt: str | None = None
    arrivedAt: str | None = None
    startedAt: str | None = None
    waitingSeconds: int = 0
    driverWaitingMinutes: int = 0
    cancelReason: str | None = None
    cancelComment: str | None = None


class RideCancelIn(BaseModel):
    comment: str | None = Field(default=None, max_length=500)


def _flow_error_to_http(exc: RideFlowError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    detail.update(exc.extra)
    return HTTPException(status_code=exc.status_code, detail=detail)


def _chat_error_to_http(exc: RideChatError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
        headers=headers,
    )


async def _load_ride(
    db_session: AsyncSession,
    *,
    ride_id: str,
    user: User,
):
    ride = await ride_chat_service.get_ride_for_passenger(
        db_session,
        ride_id=ride_id,
        user_id=user.user_id,
    )
    if ride is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Поездка не найдена.")
    return ride


async def _participants(db_session: AsyncSession, *, ride, viewer_id: str) -> list[RideChatParticipantOut]:
    """Участники чата: водитель и все пассажиры машины (попутчики видят друг друга)."""
    from sqlalchemy import select

    from app.models.ride_request import RideRequest

    participants: list[RideChatParticipantOut] = []
    if ride.driver_id:
        driver = await get_driver(db_session, driver_id=ride.driver_id)
        if driver is not None:
            participants.append(
                RideChatParticipantOut(type="driver", name=driver.name, rideId=ride.id, isMe=False)
            )

    thread_ride_ids = await ride_chat_service.list_thread_ride_ids(
        db_session,
        thread_key=ride_chat_service.thread_key_for(ride),
    )
    if thread_ride_ids:
        result = await db_session.execute(
            select(RideRequest).where(RideRequest.id.in_(thread_ride_ids))
        )
        for item in result.scalars().all():
            if item.passenger_name:
                participants.append(
                    RideChatParticipantOut(
                        type="passenger",
                        name=item.passenger_name,
                        rideId=item.id,
                        isMe=item.passenger_id == viewer_id,
                    )
                )
    return participants


async def _build_page(
    db_session: AsyncSession,
    *,
    ride,
    viewer_id: str,
    viewer_type: str,
    limit: int,
) -> RideChatPageOut:
    thread_key = ride_chat_service.thread_key_for(ride)
    messages = await ride_chat_service.list_messages(db_session, ride=ride, limit=limit)
    unread = await ride_chat_service.count_unread(
        db_session,
        ride=ride,
        reader_type=viewer_type,
        reader_id=viewer_id,
    )
    peer_read = await ride_chat_service.peer_last_read_at(
        db_session,
        ride=ride,
        reader_type=viewer_type,
    )
    can_send, reason = ride_chat_service.can_send_in_ride(ride)
    return build_chat_page(
        ride=ride,
        thread_key=thread_key,
        messages=messages,
        viewer_type=viewer_type,
        peer_last_read_at=peer_read,
        unread_count=unread,
        can_send=can_send,
        closed_reason=reason,
        participants=await _participants(db_session, ride=ride, viewer_id=viewer_id),
    )


@router.get("/{ride_id}/flow", response_model=RidePassengerFlowOut)
async def passenger_ride_flow(
    ride_id: str,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Состояние поездки для пассажирского экрана: какие кнопки показывать и почему."""
    ride = await _load_ride(db_session, ride_id=ride_id, user=current_user)
    return RidePassengerFlowOut(rideId=ride.id, **ride_status_service.passenger_flow_state(ride))


@router.get("/{ride_id}/chat", response_model=RideChatPageOut)
async def passenger_ride_chat(
    ride_id: str,
    limit: int = Query(default=DEFAULT_CHAT_LIMIT, ge=1, le=200),
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride = await _load_ride(db_session, ride_id=ride_id, user=current_user)
    return await _build_page(
        db_session,
        ride=ride,
        viewer_id=current_user.user_id,
        viewer_type="passenger",
        limit=limit,
    )


@router.get("/{ride_id}/chat/unread-count", response_model=UnreadCountOut)
async def passenger_ride_chat_unread(
    ride_id: str,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride = await _load_ride(db_session, ride_id=ride_id, user=current_user)
    count = await ride_chat_service.count_unread(
        db_session,
        ride=ride,
        reader_type="passenger",
        reader_id=current_user.user_id,
    )
    return UnreadCountOut(count=count)


@router.post("/{ride_id}/chat", response_model=RideChatPageOut)
async def passenger_send_ride_chat_message(
    ride_id: str,
    payload: RideChatSendIn,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Отправка сообщения в чат поездки.

    Сообщение сразу уходит собеседникам: в приложение (лента уведомлений и чат) и в Telegram.
    """
    ride = await _load_ride(db_session, ride_id=ride_id, user=current_user)
    try:
        await ride_chat_service.post_message(
            db_session,
            ride=ride,
            sender=ride_chat_service.RideChatSender(
                type="passenger",
                id=current_user.user_id,
                name=ride.passenger_name,
            ),
            body=payload.body,
            payload={"quick": payload.quick} if payload.quick else None,
        )
        await notify_chat_participants(
            db_session,
            ride=ride,
            sender_type="passenger",
            sender_name=ride.passenger_name,
            text=payload.body,
        )
        await db_session.commit()
    except RideChatError as exc:
        await db_session.rollback()
        raise _chat_error_to_http(exc) from exc

    await db_session.refresh(ride)
    await ride_flow_side_effects.deliver_chat_side_effects(
        ride=ride,
        sender_type="passenger",
        sender_name=ride.passenger_name,
        text=payload.body,
    )
    return await _build_page(
        db_session,
        ride=ride,
        viewer_id=current_user.user_id,
        viewer_type="passenger",
        limit=DEFAULT_CHAT_LIMIT,
    )


async def notify_chat_participants(
    db_session: AsyncSession,
    *,
    ride,
    sender_type: str,
    sender_name: str,
    text: str,
) -> int:
    """Уведомления о новом сообщении чата (in-app) в общей транзакции с сообщением."""
    from app.services.ride_notification_service import notify_chat_message

    return await notify_chat_message(
        db_session,
        ride=ride,
        sender_type=sender_type,
        sender_name=sender_name,
        text=text,
    )


@router.post("/{ride_id}/chat/read", response_model=UnreadCountOut)
async def passenger_mark_ride_chat_read(
    ride_id: str,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride = await _load_ride(db_session, ride_id=ride_id, user=current_user)
    await ride_chat_service.mark_read(
        db_session,
        thread_key=ride_chat_service.thread_key_for(ride),
        reader_type="passenger",
        reader_id=current_user.user_id,
    )
    await db_session.commit()
    return UnreadCountOut(count=0)


@router.post("/{ride_id}/ready", response_model=RidePassengerFlowOut)
async def passenger_mark_ready(
    ride_id: str,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    """«Я на месте»: водитель мгновенно видит это в приложении и Telegram.

    Это самая дешёвая страховка от неявки: водитель не уедет, а пассажир не получит
    «неявку» за то, что не успел спуститься.
    """
    try:
        result = await ride_status_service.mark_passenger_ready(
            db_session,
            ride_id=ride_id,
            user_id=current_user.user_id,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    ride = result.ride
    return RidePassengerFlowOut(rideId=ride.id, **ride_status_service.passenger_flow_state(ride))


@router.post("/{ride_id}/nudge", response_model=RidePassengerFlowOut)
async def passenger_nudge_driver(
    ride_id: str,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    """«Где вы?» — вежливый пинг водителю (с кулдауном, чтобы не превратилось в спам)."""
    try:
        result = await ride_status_service.nudge_driver(
            db_session,
            ride_id=ride_id,
            user_id=current_user.user_id,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    ride = result.ride
    return RidePassengerFlowOut(rideId=ride.id, **ride_status_service.passenger_flow_state(ride))


@router.post("/{ride_id}/cancel", response_model=RidePassengerFlowOut)
async def passenger_cancel_ride(
    ride_id: str,
    payload: RideCancelIn,
    current_user: User = Depends(require_roles(*_PASSENGER_RIDE_ROLES)),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Отмена поездки пассажиром.

    Пока водитель не приехал — отмена без последствий; если водитель уже едет или ждёт,
    отмена помечается как поздняя (водитель видит предупреждение, админ — статистику).
    """
    try:
        result = await ride_status_service.cancel_by_passenger(
            db_session,
            ride_id=ride_id,
            user_id=current_user.user_id,
            comment=payload.comment,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    ride = result.ride
    return RidePassengerFlowOut(rideId=ride.id, **ride_status_service.passenger_flow_state(ride))


# Публичный алиас: тот же конструктор страницы чата используют и водительские роуты,
# чтобы формат сообщений в приложении совпадал у обеих сторон.
build_ride_chat_page = _build_page


__all__ = [
    "RideCancelIn",
    "RidePassengerFlowOut",
    "build_ride_chat_page",
    "router",
]