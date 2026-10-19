from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.driver_portal import DriverSession, get_driver_session
from app.api.ride_chat import build_ride_chat_page, notify_chat_participants
from app.core.dependencies import get_db_session
from app.models.ride_request import RideCancelReason
from app.schemas.notification import UnreadCountOut
from app.schemas.ride_chat import RideChatPageOut, RideChatSendIn
from app.services import ride_chat_service, ride_flow_side_effects, ride_status_service
from app.services.ride_chat_service import RideChatError
from app.services.ride_status_service import RideFlowError

router = APIRouter(prefix="/driver")

DEFAULT_CHAT_LIMIT = 100

DRIVER_CANCEL_REASONS = (
    RideCancelReason.DRIVER_CANCELLED,
    RideCancelReason.DRIVER_NO_SHOW,
)


class DriverRideFlowOut(BaseModel):
    """Состояние поездки для кабинета водителя: кнопки, таймеры, непрочитанный чат."""

    rideId: str
    status: str
    flow: dict[str, Any]
    chatUnreadCount: int = 0


class DriverGeoPayload(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class DriverCancelRidePayload(BaseModel):
    reason: str | None = None
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


async def _flow_out(db_session: AsyncSession, *, ride, driver_id: str) -> DriverRideFlowOut:
    unread = await ride_chat_service.count_unread(
        db_session,
        ride=ride,
        reader_type="driver",
        reader_id=driver_id,
    )
    return DriverRideFlowOut(
        rideId=ride.id,
        status=ride.status,
        flow=ride_status_service.driver_flow_state(ride),
        chatUnreadCount=unread,
    )


@router.get("/cabinet/rides/{ride_id}/flow", response_model=DriverRideFlowOut)
async def driver_ride_flow(
    ride_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride = await ride_chat_service.get_ride_for_driver(
        db_session,
        ride_id=ride_id,
        driver_id=session.driver_id,
    )
    if ride is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Поездка не найдена.")
    return await _flow_out(db_session, ride=ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/en-route", response_model=DriverRideFlowOut)
async def driver_mark_en_route(
    ride_id: str,
    payload: DriverGeoPayload | None = None,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """«Еду на точку»: пассажир сразу видит это в приложении и Telegram."""
    try:
        result = await ride_status_service.mark_en_route(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
            lat=payload.lat if payload else None,
            lng=payload.lng if payload else None,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/arrived", response_model=DriverRideFlowOut)
async def driver_mark_arrived(
    ride_id: str,
    payload: DriverGeoPayload | None = None,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """«Прибыл»: включаем таймер ожидания, напоминание пассажиру и право на неявку."""
    try:
        result = await ride_status_service.mark_arrived(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
            lat=payload.lat if payload else None,
            lng=payload.lng if payload else None,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/start", response_model=DriverRideFlowOut)
async def driver_start_ride(
    ride_id: str,
    payload: DriverGeoPayload | None = None,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Пассажир в машине: поездка началась (строго после «Прибыл»)."""
    try:
        result = await ride_status_service.start_ride(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
            lat=payload.lat if payload else None,
            lng=payload.lng if payload else None,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/complete", response_model=DriverRideFlowOut)
async def driver_complete_ride(
    ride_id: str,
    payload: DriverGeoPayload | None = None,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Поездка завершена."""
    try:
        result = await ride_status_service.complete_ride(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
            lat=payload.lat if payload else None,
            lng=payload.lng if payload else None,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/wait-extend", response_model=DriverRideFlowOut)
async def driver_extend_wait(
    ride_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Продлить ожидание пассажира на точке (один раз)."""
    try:
        result = await ride_status_service.extend_wait(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/undo", response_model=DriverRideFlowOut)
async def driver_undo_status(
    ride_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Откат ошибочно нажатой кнопки («Прибыл» / «Начал поездку») в коротком окне."""
    try:
        result = await ride_status_service.undo_last_status(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/no-show", response_model=DriverRideFlowOut)
async def driver_report_no_show(
    ride_id: str,
    payload: DriverCancelRidePayload | None = None,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """«Пассажир не вышел»: доступно только после прибытия и минимального ожидания.

    Пассажир получает понятное объяснение, админ — уведомление, поездка попадает в статистику.
    """
    try:
        result = await ride_status_service.cancel_by_driver(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
            reason_code=RideCancelReason.DRIVER_NO_SHOW,
            comment=payload.comment if payload else None,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{ride_id}/cancel", response_model=DriverRideFlowOut)
async def driver_cancel_ride(
    ride_id: str,
    payload: DriverCancelRidePayload | None = None,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Отмена поездки водителем до посадки пассажира (с причиной и комментарием)."""
    reason = (payload.reason if payload else None) or RideCancelReason.DRIVER_CANCELLED
    if reason not in DRIVER_CANCEL_REASONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_reason", "message": "Недопустимая причина отмены."},
        )
    try:
        result = await ride_status_service.cancel_by_driver(
            db_session,
            ride_id=ride_id,
            driver_id=session.driver_id,
            reason_code=reason,
            comment=payload.comment if payload else None,
        )
    except RideFlowError as exc:
        raise _flow_error_to_http(exc) from exc
    await ride_flow_side_effects.deliver_flow_side_effects(result)
    return await _flow_out(db_session, ride=result.ride, driver_id=session.driver_id)


async def _load_driver_ride(db_session: AsyncSession, *, ride_id: str, driver_id: str):
    ride = await ride_chat_service.get_ride_for_driver(
        db_session,
        ride_id=ride_id,
        driver_id=driver_id,
    )
    if ride is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Поездка не найдена.")
    return ride


@router.get("/cabinet/rides/{ride_id}/chat", response_model=RideChatPageOut)
async def driver_ride_chat(
    ride_id: str,
    limit: int = Query(default=DEFAULT_CHAT_LIMIT, ge=1, le=200),
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Чат поездки: водитель и все попутчики одной машины видят общую переписку."""
    ride = await _load_driver_ride(db_session, ride_id=ride_id, driver_id=session.driver_id)
    return await build_ride_chat_page(
        db_session,
        ride=ride,
        viewer_id=session.driver_id,
        viewer_type="driver",
        limit=limit,
    )


@router.get("/cabinet/rides/{ride_id}/chat/unread-count", response_model=UnreadCountOut)
async def driver_ride_chat_unread(
    ride_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride = await _load_driver_ride(db_session, ride_id=ride_id, driver_id=session.driver_id)
    count = await ride_chat_service.count_unread(
        db_session,
        ride=ride,
        reader_type="driver",
        reader_id=session.driver_id,
    )
    return UnreadCountOut(count=count)


@router.post("/cabinet/rides/{ride_id}/chat", response_model=RideChatPageOut)
async def driver_send_ride_chat_message(
    ride_id: str,
    payload: RideChatSendIn,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Сообщение водителя в групповой чат поездки (водитель + все попутчики)."""
    ride = await _load_driver_ride(db_session, ride_id=ride_id, driver_id=session.driver_id)
    try:
        await ride_chat_service.post_message(
            db_session,
            ride=ride,
            sender=ride_chat_service.RideChatSender(
                type="driver",
                id=session.driver_id,
                name=session.name,
            ),
            body=payload.body,
            payload={"quick": payload.quick} if payload.quick else None,
        )
        await notify_chat_participants(
            db_session,
            ride=ride,
            sender_type="driver",
            sender_name=session.name,
            text=payload.body,
        )
        await db_session.commit()
    except RideChatError as exc:
        await db_session.rollback()
        raise _chat_error_to_http(exc) from exc

    await db_session.refresh(ride)
    return await build_ride_chat_page(
        db_session,
        ride=ride,
        viewer_id=session.driver_id,
        viewer_type="driver",
        limit=DEFAULT_CHAT_LIMIT,
    )


@router.post("/cabinet/rides/{ride_id}/chat/read", response_model=UnreadCountOut)
async def driver_mark_ride_chat_read(
    ride_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride = await _load_driver_ride(db_session, ride_id=ride_id, driver_id=session.driver_id)
    await ride_chat_service.mark_read(
        db_session,
        thread_key=ride_chat_service.thread_key_for(ride),
        reader_type="driver",
        reader_id=session.driver_id,
    )
    await db_session.commit()
    return UnreadCountOut(count=0)


__all__ = [
    "DriverCancelRidePayload",
    "DriverGeoPayload",
    "DriverRideFlowOut",
    "router",
]