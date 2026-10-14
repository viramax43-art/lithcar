"""Tests for the hardened driver ride lifecycle: «Еду на точку», «Прибыл», ожидание, неявка."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.security import create_access_token
from app.models.notification import Notification, NotificationType
from app.models.ride_message import RideChatMessage
from app.models.ride_request import RideCancelReason, RideRequest, RideRequestStatus
from app.models.ride_status_event import RideStatusEvent
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso


def _headers_for(user_id: str, role: str) -> dict[str, str]:
    token = create_access_token(subject=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


async def _create_zone(client) -> None:
    response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert response.status_code == 200
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Flow test zone",
            "color": "#3B82F6",
            "polygon": [
                {"lat": 54.72, "lng": 25.22},
                {"lat": 54.72, "lng": 25.34},
                {"lat": 54.65, "lng": 25.34},
                {"lat": 54.65, "lng": 25.22},
            ],
            "isActive": True,
        },
    )
    assert response.status_code == 200


async def _setup_ride(client, db_session, *, hours_ahead: float = 2, suffix: str = "flow"):
    """Зона, водитель, пассажир и назначенная поездка — общая заготовка для тестов флоу."""
    await _create_zone(client)

    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": f"Flow Driver {suffix}",
            "carBrand": "VW",
            "carModel": "Golf",
            "carPlate": f"FLW{suffix[:3].upper()}",
            "vehicleColor": "Blue",
            "seatsCount": 4,
            "licenseNumber": "LIC-FLW",
            "about": "",
            "rating": 4.8,
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]

    passenger = User(
        user_id=f"passenger-{suffix}",
        username=f"flow_passenger_{suffix}",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()
    passenger_headers = _headers_for(passenger.user_id, passenger.role)

    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": f"Flow Passenger {suffix}",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=hours_ahead),
        },
        headers=passenger_headers,
    )
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]

    assigned = await client.patch(
        f"/api/ride-requests/{request_id}/assign",
        json={"driverId": driver_id},
    )
    assert assigned.status_code == 200

    driver_login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert driver_login.status_code == 200

    return {
        "driver_id": driver_id,
        "driver_key": driver_key,
        "passenger": passenger,
        "passenger_headers": passenger_headers,
        "request_id": request_id,
    }


async def test_driver_flow_en_route_arrived_start_complete(client, db_session):
    """Полный путь водителя: еду → прибыл → начал → завершил, с таймстемпами и историей."""
    ctx = await _setup_ride(client, db_session, suffix="full")
    ride_id = ctx["request_id"]

    en_route = await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    assert en_route.status_code == 200, en_route.text
    assert en_route.json()["status"] == "en_route_to_pickup"
    assert en_route.json()["flow"]["canArrived"] is True

    arrived = await client.post(
        f"/api/driver/cabinet/rides/{ride_id}/arrived",
        json={"lat": 54.69, "lng": 25.27},
    )
    assert arrived.status_code == 200, arrived.text
    assert arrived.json()["status"] == "awaiting_passenger"
    # Водитель на точке: расстояние посчитано, неявка пока недоступна (нужно подождать).
    assert arrived.json()["flow"]["noShowSecondsLeft"] > 0
    assert arrived.json()["flow"]["canReportNoShow"] is False

    started = await client.post(f"/api/driver/cabinet/rides/{ride_id}/start")
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "in_progress"

    completed = await client.post(f"/api/driver/cabinet/rides/{ride_id}/complete")
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.status == RideRequestStatus.COMPLETED
    assert ride.en_route_at is not None
    assert ride.arrived_at is not None
    assert ride.started_at is not None
    assert ride.completed_at is not None
    assert ride.arrival_distance_m is not None and ride.arrival_distance_m < 50

    events = (
        await db_session.execute(
            select(RideStatusEvent)
            .where(RideStatusEvent.ride_id == ride_id)
            .order_by(RideStatusEvent.created_at)
        )
    ).scalars().all()
    assert [event.to_status for event in events] == [
        "en_route_to_pickup",
        "awaiting_passenger",
        "in_progress",
        "completed",
    ]

    # В чате поездки осталась «история» — обеим сторонам понятно, что происходило.
    chat_messages = (
        await db_session.execute(select(RideChatMessage).where(RideChatMessage.ride_id == ride_id))
    ).scalars().all()
    assert len(chat_messages) >= 4


async def test_en_route_too_early_is_rejected(client, db_session):
    """Поездка на 10 часов вперёд: нельзя объявить «уже еду» — пассажир не должен ждать впустую."""
    ctx = await _setup_ride(client, db_session, hours_ahead=10, suffix="early")

    response = await client.post(f"/api/driver/cabinet/rides/{ctx['request_id']}/en-route")
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "too_early"
    assert detail["canStartAt"] is not None

    ride = await db_session.get(RideRequest, ctx["request_id"])
    assert ride.status == RideRequestStatus.ASSIGNED


async def test_en_route_is_idempotent_for_double_tap(client, db_session):
    """Двойное нажатие «Еду на точку» (или второе устройство) не создаёт дублей и спама."""
    ctx = await _setup_ride(client, db_session, suffix="idem")
    ride_id = ctx["request_id"]

    first = await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    second = await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    assert first.status_code == 200 and second.status_code == 200
    assert second.json()["status"] == "en_route_to_pickup"

    events = (
        await db_session.execute(select(RideStatusEvent).where(RideStatusEvent.ride_id == ride_id))
    ).scalars().all()
    assert len(events) == 1

    notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == ctx["passenger"].user_id,
                Notification.type == NotificationType.RIDE_EN_ROUTE,
            )
        )
    ).scalars().all()
    assert len(notifications) == 1


async def test_arrived_shortcut_and_undo_window(client, db_session):
    """Водитель забыл нажать «Еду» — прибытие принимаем; ошибочный шаг можно откатить."""
    ctx = await _setup_ride(client, db_session, suffix="undo")
    ride_id = ctx["request_id"]

    arrived = await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    assert arrived.status_code == 200, arrived.text
    assert arrived.json()["status"] == "awaiting_passenger"
    assert arrived.json()["flow"]["canUndo"] is True

    undo = await client.post(f"/api/driver/cabinet/rides/{ride_id}/undo")
    assert undo.status_code == 200, undo.text
    assert undo.json()["status"] == "en_route_to_pickup"

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.arrived_at is None

    # В статусе «еду на точку» откатывать нечего.
    second_undo = await client.post(f"/api/driver/cabinet/rides/{ride_id}/undo")
    assert second_undo.status_code == 409
    assert second_undo.json()["detail"]["code"] == "nothing_to_undo"

    # Окно отката ограничено: если статус висит давно, кнопка «отменить отметку» уже не работает.
    arrived_again = await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    assert arrived_again.status_code == 200
    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id == ride_id)
        .values(status_updated_at=datetime.now(timezone.utc) - timedelta(minutes=30))
    )
    await db_session.commit()

    expired = await client.post(f"/api/driver/cabinet/rides/{ride_id}/undo")
    assert expired.status_code == 409
    assert expired.json()["detail"]["code"] == "undo_window_expired"


async def test_no_show_requires_arrival_and_minimum_wait(client, db_session):
    """Неявку нельзя оформить мгновенно — пассажир защищён от «уехал через 10 секунд»."""
    ctx = await _setup_ride(client, db_session, suffix="noshow")
    ride_id = ctx["request_id"]

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")

    too_early = await client.post(f"/api/driver/cabinet/rides/{ride_id}/no-show")
    assert too_early.status_code == 409
    detail = too_early.json()["detail"]
    assert detail["code"] == "no_show_too_early"
    assert detail["availableInSeconds"] > 0

    # Имитируем, что водитель действительно прождал положенное время.
    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id == ride_id)
        .values(arrived_at=datetime.now(timezone.utc) - timedelta(minutes=10))
    )
    await db_session.commit()

    reported = await client.post(f"/api/driver/cabinet/rides/{ride_id}/no-show", json={})
    assert reported.status_code == 200, reported.text
    assert reported.json()["status"] == "cancelled"

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.status == RideRequestStatus.CANCELLED
    assert ride.cancel_reason == RideCancelReason.DRIVER_NO_SHOW
    assert ride.cancelled_by == "driver"
    assert ride.admin_attention_reason == "no_show"

    passenger_notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == ctx["passenger"].user_id,
                Notification.type == NotificationType.RIDE_NO_SHOW,
            )
        )
    ).scalars().all()
    assert len(passenger_notifications) == 1


async def test_passenger_late_cancel_is_marked_and_driver_notified(client, db_session):
    """Отмена, когда водитель уже едет — «поздняя»: водитель видит причину, поездка помечена."""
    ctx = await _setup_ride(client, db_session, suffix="cancel")
    ride_id = ctx["request_id"]
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")

    response = await client.post(
        f"/api/rides/{ride_id}/cancel",
        json={"comment": "не смогу поехать"},
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert response.json()["canSendMessage"] is False

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.status == RideRequestStatus.CANCELLED
    assert ride.cancel_reason == RideCancelReason.PASSENGER_LATE_CANCELLED
    assert ride.cancel_comment == "не смогу поехать"
    assert ride.cancelled_by == "passenger"

    driver_notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == ctx["driver_id"],
                Notification.type == NotificationType.RIDE_CANCELLED,
            )
        )
    ).scalars().all()
    assert len(driver_notifications) == 1


async def test_watchdog_reminds_waiting_passenger_and_driver(client, db_session):
    """Сторож закрывает «зависшие» статусы: напоминает пассажиру и подсказывает водителю."""
    from app.db import async_session_factory
    from app.services.ride_status_service import run_watchdog

    ctx = await _setup_ride(client, db_session, suffix="watch")
    ride_id = ctx["request_id"]
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")

    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id == ride_id)
        .values(arrived_at=datetime.now(timezone.utc) - timedelta(minutes=30))
    )
    await db_session.commit()

    async with async_session_factory() as session:
        counters = await run_watchdog(session)
    assert counters["wait_reminders"] == 1
    assert counters["no_show_available"] == 1

    # Повторный тик ничего не дублирует — все напоминания одноразовые.
    async with async_session_factory() as session:
        second = await run_watchdog(session)
    assert second["wait_reminders"] == 0
    assert second["no_show_available"] == 0

    passenger_notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == ctx["passenger"].user_id,
                Notification.type == NotificationType.RIDE_WAIT_REMINDER,
            )
        )
    ).scalars().all()
    assert len(passenger_notifications) == 1

    driver_notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == ctx["driver_id"],
                Notification.type == NotificationType.RIDE_NO_SHOW_AVAILABLE,
            )
        )
    ).scalars().all()
    assert len(driver_notifications) == 1

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.arrival_reminder_sent_at is not None
    # Долгое ожидание уходит админам: поездка помечена «требует внимания».
    assert ride.admin_attention_reason == "waiting_too_long"