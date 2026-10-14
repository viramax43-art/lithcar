"""Tests for the ride chat (водитель ↔ попутчики) with unread counters and access rules."""
from __future__ import annotations

from sqlalchemy import select, update

from app.core.security import create_access_token
from app.models.notification import Notification, NotificationType
from app.models.ride_request import RideRequest
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso
from tests.test_ride_flow_lifecycle import _headers_for, _setup_ride


async def test_chat_exchange_between_passenger_and_driver(client, db_session):
    """Пассажир пишет — водитель видит непрочитанное, отвечает — пассажир видит ответ."""
    ctx = await _setup_ride(client, db_session, suffix="chat")
    ride_id = ctx["request_id"]

    sent = await client.post(
        f"/api/rides/{ride_id}/chat",
        json={"body": "Я у второго подъезда, в красной куртке"},
        headers=ctx["passenger_headers"],
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["canSend"] is True
    assert sent.json()["items"][-1]["body"] == "Я у второго подъезда, в красной куртке"
    # Кто в чате: водитель и пассажир (попутчиков нет).
    participant_types = {item["type"] for item in sent.json()["participants"]}
    assert participant_types == {"driver", "passenger"}

    driver_view = await client.get(f"/api/driver/cabinet/rides/{ride_id}/chat")
    assert driver_view.status_code == 200, driver_view.text
    assert driver_view.json()["unreadCount"] == 1
    assert driver_view.json()["items"][-1]["mine"] is False

    # Водителю пришло и уведомление в приложении, и (при включённом боте) сообщение в Telegram.
    driver_notifications = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == ctx["driver_id"],
                Notification.type == NotificationType.RIDE_CHAT_MESSAGE,
            )
        )
    ).scalars().all()
    assert len(driver_notifications) == 1
    assert "второго подъезда" in driver_notifications[0].body

    marked = await client.post(f"/api/driver/cabinet/rides/{ride_id}/chat/read")
    assert marked.status_code == 200
    assert marked.json()["count"] == 0

    reply = await client.post(
        f"/api/driver/cabinet/rides/{ride_id}/chat",
        json={"body": "Понял, подъезжаю через 3 минуты"},
    )
    assert reply.status_code == 200, reply.text

    passenger_view = await client.get(
        f"/api/rides/{ride_id}/chat",
        headers=ctx["passenger_headers"],
    )
    assert passenger_view.status_code == 200
    assert passenger_view.json()["unreadCount"] == 1
    assert passenger_view.json()["items"][-1]["senderType"] == "driver"
    assert passenger_view.json()["items"][-1]["mine"] is False

    cleared = await client.post(
        f"/api/rides/{ride_id}/chat/read",
        headers=ctx["passenger_headers"],
    )
    assert cleared.json()["count"] == 0


async def test_chat_closes_after_completion_but_history_stays(client, db_session):
    """После завершения поездки чат нельзя пополнять, но история остаётся доступной."""
    ctx = await _setup_ride(client, db_session, suffix="closed")
    ride_id = ctx["request_id"]

    await client.post(
        f"/api/rides/{ride_id}/chat",
        json={"body": "Спасибо!"},
        headers=ctx["passenger_headers"],
    )
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/arrived")
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/start")
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/complete")

    blocked = await client.post(
        f"/api/rides/{ride_id}/chat",
        json={"body": "ещё сообщение"},
        headers=ctx["passenger_headers"],
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "ride_closed"

    history = await client.get(f"/api/rides/{ride_id}/chat", headers=ctx["passenger_headers"])
    assert history.status_code == 200
    assert history.json()["canSend"] is False
    assert history.json()["closedReason"] == "ride_closed"
    assert any(item["body"] == "Спасибо!" for item in history.json()["items"])


async def test_chat_access_control_and_validation(client, db_session):
    """Чужую поездку читать нельзя, пустое сообщение не отправляем."""
    ctx = await _setup_ride(client, db_session, suffix="acl")
    ride_id = ctx["request_id"]

    stranger = User(
        user_id="passenger-stranger-acl",
        username="stranger_acl",
        role=UserRole.PASSENGER,
        points_balance=10,
    )
    db_session.add(stranger)
    await db_session.commit()
    stranger_headers = _headers_for(stranger.user_id, stranger.role)

    denied = await client.get(f"/api/rides/{ride_id}/chat", headers=stranger_headers)
    assert denied.status_code == 404

    empty = await client.post(
        f"/api/rides/{ride_id}/chat",
        json={"body": "   "},
        headers=ctx["passenger_headers"],
    )
    assert empty.status_code == 400
    assert empty.json()["detail"]["code"] == "empty_message"

    # Без авторизации — тоже отказ.
    anonymous = await client.get(f"/api/rides/{ride_id}/chat")
    assert anonymous.status_code in (401, 403)


async def test_group_chat_is_shared_with_co_passengers(client, db_session):
    """Попутчики одной машины видят общую переписку с водителем (чат группы)."""
    ctx = await _setup_ride(client, db_session, suffix="group")
    driver_id = ctx["driver_id"]

    co_passenger = User(
        user_id="passenger-copilot-group",
        username="copilot_group",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(co_passenger)
    await db_session.commit()
    co_headers = _headers_for(co_passenger.user_id, co_passenger.role)

    created = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Co Passenger",
            "fromPoint": {"address": "Start C", "latlng": {"lat": 54.691, "lng": 25.271}},
            "toPoint": {"address": "End D", "latlng": {"lat": 54.701, "lng": 25.281}},
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
        },
        headers=co_headers,
    )
    assert created.status_code == 201
    co_ride_id = created.json()["id"]

    assigned = await client.patch(
        f"/api/ride-requests/{co_ride_id}/assign",
        json={"driverId": driver_id},
    )
    assert assigned.status_code == 200

    # Группа «одна машина»: администратор/подбор объединяет заявки общим group_id.
    await db_session.execute(
        update(RideRequest)
        .where(RideRequest.id.in_([ctx["request_id"], co_ride_id]))
        .values(group_id="grp-chat-test")
    )
    await db_session.commit()

    await client.post(
        f"/api/rides/{ctx['request_id']}/chat",
        json={"body": "Я первый, жду у входа"},
        headers=ctx["passenger_headers"],
    )

    co_view = await client.get(f"/api/rides/{co_ride_id}/chat", headers=co_headers)
    assert co_view.status_code == 200, co_view.text
    assert any(item["body"] == "Я первый, жду у входа" for item in co_view.json()["items"])
    assert co_view.json()["unreadCount"] >= 1

    # Водитель видит сообщения всей группы в одном треде.
    driver_view = await client.get(f"/api/driver/cabinet/rides/{ctx['request_id']}/chat")
    assert driver_view.status_code == 200
    assert any(item["body"] == "Я первый, жду у входа" for item in driver_view.json()["items"])


async def test_passenger_nudge_has_cooldown(client, db_session):
    """«Где вы?» можно отправить один раз — дальше система просит подождать."""
    ctx = await _setup_ride(client, db_session, suffix="nudge")
    ride_id = ctx["request_id"]
    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")

    first = await client.post(
        f"/api/rides/{ride_id}/nudge",
        headers=ctx["passenger_headers"],
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/api/rides/{ride_id}/nudge",
        headers=ctx["passenger_headers"],
    )
    assert second.status_code == 429
    detail = second.json()["detail"]
    assert detail["code"] == "nudge_cooldown"
    assert detail["retryAfterSeconds"] > 0

    chat = await client.get(f"/api/rides/{ride_id}/chat", headers=ctx["passenger_headers"])
    quick_messages = [item for item in chat.json()["items"] if item["kind"] == "quick_reply"]
    assert len(quick_messages) == 1