"""Tests for in-app ride notifications and the merged notification feed.

Требование клиента: события поездки должны приходить не только в Telegram, но и в уведомления
внутри приложения (пассажиру и водителю).
"""
from __future__ import annotations

from sqlalchemy import select

from app.models.notification import Notification, NotificationType
from app.models.ride_request import RideRequest
from tests.test_ride_flow_lifecycle import _setup_ride


async def test_assign_creates_in_app_notifications_for_both_sides(client, db_session):
    """Назначение водителя видно и пассажиру, и водителю прямо в приложении."""
    ctx = await _setup_ride(client, db_session, suffix="assign")

    passenger_feed = await client.get(
        "/api/v1/notifications/passenger?limit=20",
        headers=ctx["passenger_headers"],
    )
    assert passenger_feed.status_code == 200, passenger_feed.text
    passenger_types = [item["type"] for item in passenger_feed.json()["items"]]
    assert NotificationType.RIDE_ASSIGNED in passenger_types
    assigned_item = next(
        item for item in passenger_feed.json()["items"] if item["type"] == NotificationType.RIDE_ASSIGNED
    )
    assert assigned_item["payload"]["rideId"] == ctx["request_id"]
    assert assigned_item["payload"]["rideNumber"] is not None

    passenger_unread = await client.get(
        "/api/v1/notifications/passenger/unread-count",
        headers=ctx["passenger_headers"],
    )
    assert passenger_unread.json()["count"] >= 1

    driver_feed = await client.get("/api/driver/notifications?limit=20")
    assert driver_feed.status_code == 200, driver_feed.text
    assert NotificationType.RIDE_ASSIGNED in [item["type"] for item in driver_feed.json()["items"]]

    stored = (
        await db_session.execute(
            select(Notification).where(
                Notification.type == NotificationType.RIDE_ASSIGNED,
                Notification.recipient_id == ctx["driver_id"],
            )
        )
    ).scalars().all()
    assert len(stored) == 1


async def test_passenger_ready_reaches_driver_in_app(client, db_session):
    """«Я на месте» — водитель видит событие в ленте и в чате поездки."""
    ctx = await _setup_ride(client, db_session, suffix="ready")
    ride_id = ctx["request_id"]

    await client.post(f"/api/driver/cabinet/rides/{ride_id}/en-route")

    ready = await client.post(f"/api/rides/{ride_id}/ready", headers=ctx["passenger_headers"])
    assert ready.status_code == 200, ready.text
    assert ready.json()["passengerReady"] is True

    driver_feed = await client.get("/api/driver/notifications?limit=20")
    assert NotificationType.RIDE_PASSENGER_READY in [
        item["type"] for item in driver_feed.json()["items"]
    ]

    chat = await client.get(f"/api/driver/cabinet/rides/{ride_id}/chat")
    assert any(item["kind"] == "quick_reply" for item in chat.json()["items"])

    ride = await db_session.get(RideRequest, ride_id)
    await db_session.refresh(ride)
    assert ride.passenger_ready_at is not None


async def test_feed_merges_admin_info_blocks_with_ride_events(client, db_session):
    """Лента в приложении = админские инфо-блоки + события поездки, в одном списке."""
    ctx = await _setup_ride(client, db_session, suffix="feed")

    created_block = await client.post(
        "/api/admin/info-blocks",
        json={
            "pool": "passenger",
            "titleI18n": {
                "lt": "Naujiena",
                "pl": "Nowosc",
                "en": "News",
                "ru": "Новость",
            },
            "bodyI18n": {
                "lt": "Nauja akcija keleiviams",
                "pl": "Nowa promocja",
                "en": "New promotion",
                "ru": "Новая акция для пассажиров",
            },
            "audience": "all",
        },
    )
    assert created_block.status_code == 201, created_block.text

    feed = await client.get("/api/v1/notifications/passenger?limit=20", headers=ctx["passenger_headers"])
    assert feed.status_code == 200
    items = feed.json()["items"]
    types = {item["type"] for item in items}
    assert NotificationType.INFO_BLOCK in types
    assert NotificationType.RIDE_ASSIGNED in types
    # Лента отсортирована по времени: свежее — выше.
    timestamps = [item["createdAt"] for item in items]
    assert timestamps == sorted(timestamps, reverse=True)

    read_all = await client.post(
        "/api/v1/notifications/passenger/read-all",
        headers=ctx["passenger_headers"],
    )
    assert read_all.status_code == 200
    assert read_all.json()["count"] == 0

    after = await client.get(
        "/api/v1/notifications/passenger/unread-count",
        headers=ctx["passenger_headers"],
    )
    assert after.json()["count"] == 0

    feed_after = await client.get(
        "/api/v1/notifications/passenger?limit=20",
        headers=ctx["passenger_headers"],
    )
    assert all(item["readAt"] is not None for item in feed_after.json()["items"])