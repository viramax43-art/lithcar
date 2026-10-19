"""Hardening tests: refunds, no-show fees, strict start sequence and watchdog auto-close."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.models.ride_request import RideCancelReason, RideRequest, RideRequestStatus
from app.models.user import User
from tests.test_ride_flow_lifecycle import _setup_ride


async def test_start_requires_arrival_and_cannot_skip_steps(client, db_session):
    """«Начать поездку» нельзя ни из «назначен», ни из «еду»: только после «Прибыл»."""
    ctx = await _setup_ride(client, db_session, suffix="startseq")
    ride_id = ctx["request_id"]

    too_early = await client.post(f"/api/driver/cabinet/rides/{ride_id}/start")
    assert too_early.status_code == 409
    assert too_early.json()["detail"]["code"] == "not_arrived"

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    still_not_arrived = await client.post(f"/api/driver/cabinet/rides/{ride_id}/start")
    assert still_not_arrived.status_code == 409
    assert still_not_arrived.json()["detail"]["code"] == "not_arrived"

    arrived = await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    assert arrived.status_code == 200
    started = await client.post(f"/api/driver/cabinet/rides/{ride_id}/start")
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "in_progress"


async def test_early_passenger_cancel_refunds_all_points(client, db_session):
    """Отмена до выезда водителя — полный возврат баллов, повторная отмена идемпотентна."""
    ctx = await _setup_ride(client, db_session, suffix="refund")
    ride_id = ctx["request_id"]
    ride = await db_session.get(RideRequest, ride_id)
    paid = int(ride.quoted_points or 0)
    assert paid > 0

    response = await client.post(
        f"/api/rides/{ride_id}/cancel",
        json={"comment": "plans changed"},
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 200, response.text

    await db_session.refresh(ride)
    passenger = await db_session.get(User, ctx["passenger"].user_id)
    await db_session.refresh(passenger)
    assert ride.refund_points == paid
    assert passenger.points_balance == 100

    # Повторный клик не возвращает баллы второй раз.
    repeat = await client.post(
        f"/api/rides/{ride_id}/cancel",
        json={},
        headers=ctx["passenger_headers"],
    )
    assert repeat.status_code == 200
    await db_session.refresh(passenger)
    assert passenger.points_balance == 100


async def test_late_passenger_cancel_charges_fee_and_keeps_rest(client, db_session):
    """Поздняя отмена: часть стоимости удерживается как компенсация водителю."""
    ctx = await _setup_ride(client, db_session, suffix="latefee")
    ride_id = ctx["request_id"]
    ride = await db_session.get(RideRequest, ride_id)
    paid = int(ride.quoted_points or 0)

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    response = await client.post(
        f"/api/rides/{ride_id}/cancel",
        json={"comment": "cannot come"},
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 200, response.text

    await db_session.refresh(ride)
    expected_refund = int(round(paid * 0.8))
    fee = paid - expected_refund
    assert ride.cancel_reason == RideCancelReason.PASSENGER_LATE_CANCELLED
    assert ride.refund_points == expected_refund
    assert ride.settlement_reason == RideCancelReason.PASSENGER_LATE_CANCELLED

    passenger = await db_session.get(User, ctx["passenger"].user_id)
    await db_session.refresh(passenger)
    assert passenger.points_balance == 100 - fee



async def test_no_show_keeps_fee_and_refunds_rest(client, db_session):
    """Неявка пассажира: 80% возвращается, 20% остаётся как компенсация за ожидание."""
    ctx = await _setup_ride(client, db_session, suffix="noshowfee")
    ride_id = ctx["request_id"]
    ride = await db_session.get(RideRequest, ride_id)
    paid = int(ride.quoted_points or 0)

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id == ride_id)
        .values(arrived_at=datetime.now(timezone.utc) - timedelta(minutes=10))
    )
    await db_session.commit()

    response = await client.post(f"/api/driver/cabinet/rides/{ride_id}/no-show", json={})
    assert response.status_code == 200, response.text

    await db_session.refresh(ride)
    assert ride.cancel_reason == RideCancelReason.DRIVER_NO_SHOW
    assert ride.refund_points == int(round(paid * 0.8))
    assert ride.admin_attention_reason == "no_show"


async def test_passenger_can_dispute_accidental_start(client, db_session):
    """«Поездка не начиналась»: отмена с полным возвратом в окне после старта."""
    ctx = await _setup_ride(client, db_session, suffix="dispute")
    ride_id = ctx["request_id"]
    ride = await db_session.get(RideRequest, ride_id)
    paid = int(ride.quoted_points or 0)

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    started = await client.post(f"/api/driver/cabinet/rides/{ride_id}/start")
    assert started.status_code == 200, started.text

    response = await client.post(
        f"/api/rides/{ride_id}/dispute-start",
        json={"comment": "I am still outside"},
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"

    await db_session.refresh(ride)
    passenger = await db_session.get(User, ctx["passenger"].user_id)
    await db_session.refresh(passenger)
    assert ride.cancel_reason == RideCancelReason.PASSENGER_DISPUTE_START
    assert ride.dispute_at is not None
    assert ride.refund_points == paid
    assert passenger.points_balance == 100


async def test_watchdog_auto_closes_passenger_no_show(client, db_session):
    """Пассажир не вышел за максимальное время ожидания — авто-неявка."""
    from app.db import async_session_factory
    from app.services.ride_status_service import run_watchdog

    ctx = await _setup_ride(client, db_session, suffix="autons")
    ride_id = ctx["request_id"]
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id == ride_id)
        .values(arrived_at=datetime.now(timezone.utc) - timedelta(minutes=20))
    )
    await db_session.commit()

    async with async_session_factory() as session:
        counters = await run_watchdog(session)
    assert counters["auto_no_show"] == 1

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.status == RideRequestStatus.CANCELLED
    assert ride.cancel_reason == RideCancelReason.SYSTEM_NO_SHOW
    assert ride.auto_resolved_at is not None


async def test_watchdog_auto_cancels_driver_who_never_left(client, db_session):
    """Водитель не выехал после назначенного времени — авто-отмена с возвратом."""
    from app.db import async_session_factory
    from app.services.ride_status_service import run_watchdog

    ctx = await _setup_ride(client, db_session, suffix="autolate")
    ride_id = ctx["request_id"]
    ride = await db_session.get(RideRequest, ride_id)
    paid = int(ride.quoted_points or 0)
    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id == ride_id)
        .values(date_time=datetime.now(timezone.utc) - timedelta(minutes=31))
    )
    await db_session.commit()

    async with async_session_factory() as session:
        counters = await run_watchdog(session)
    assert counters["auto_cancels"] == 1

    await db_session.refresh(ride)
    passenger = await db_session.get(User, ctx["passenger"].user_id)
    await db_session.refresh(passenger)
    assert ride.status == RideRequestStatus.CANCELLED
    assert ride.cancel_reason == RideCancelReason.SYSTEM_DRIVER_LATE
    assert ride.refund_points == paid
    assert passenger.points_balance == 100


async def test_driver_cancel_refunds_passenger_in_full(client, db_session):
    """Если водитель отказался — пассажир не платит: полный возврат."""
    ctx = await _setup_ride(client, db_session, suffix="drivercxl")
    ride_id = ctx["request_id"]
    ride = await db_session.get(RideRequest, ride_id)
    paid = int(ride.quoted_points or 0)

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    response = await client.post(
        f"/api/driver/cabinet/rides/{ride_id}/cancel",
        json={"reason": "driver_cancelled", "comment": "car broke down"},
    )
    assert response.status_code == 200, response.text

    await db_session.refresh(ride)
    passenger = await db_session.get(User, ctx["passenger"].user_id)
    await db_session.refresh(passenger)
    assert ride.cancel_reason == RideCancelReason.DRIVER_CANCELLED
    assert ride.refund_points == paid
    assert passenger.points_balance == 100
    assert ride.admin_attention_reason == "driver_cancelled"
