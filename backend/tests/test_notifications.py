from __future__ import annotations

from unittest.mock import AsyncMock, patch

from tests.test_auth import _make_tg_init_data
from tests.test_driver_registration import _admin_login, _passenger_token


async def _create_admin_key(client, *, name: str, role: str) -> str:
    created = await client.post("/api/admin/keys", json={"name": name, "role": role})
    assert created.status_code == 200
    return created.json()["key"]


async def test_submit_driver_application_creates_admin_notifications(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="301", username="notify_admin")

    submit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "lt",
            "answers": {
                "full_name": "Notify Admin Driver",
                "car_brand": "Toyota",
                "car_model": "Camry",
                "car_plate": "NTF301",
                "vehicle_color": "White",
            },
            "files": {},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit.status_code == 200
    application_id = submit.json()["id"]

    listed = await client.get("/api/admin/notifications")
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] >= 1
    match = next(item for item in body["items"] if item["type"] == "driver_application_new")
    assert match["payload"]["applicationId"] == application_id
    assert match["payload"]["applicantName"] == "Notify Admin Driver"
    assert match["readAt"] is None

    unread = await client.get("/api/admin/notifications/unread-count")
    assert unread.status_code == 200
    assert unread.json()["count"] >= 1


async def test_admin_broadcast_and_passenger_inbox(client):
    await _admin_login(client)
    token_a = await _passenger_token(client, user_id="302", username="passenger_a")
    token_b = await _passenger_token(client, user_id="303", username="passenger_b")

    send = await client.post(
        "/api/admin/notifications/send",
        json={
            "pool": "passenger",
            "mode": "broadcast",
            "title": "Service update",
            "body": "We updated pricing today.",
            "sendTelegram": False,
        },
    )
    assert send.status_code == 200
    assert send.json()["sentCount"] >= 2

    inbox_a = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert inbox_a.status_code == 200
    items_a = inbox_a.json()["items"]
    assert any(item["title"] == "Service update" for item in items_a)

    inbox_b = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert inbox_b.status_code == 200
    assert any(item["title"] == "Service update" for item in inbox_b.json()["items"])


async def test_admin_single_send_to_passenger(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="304", username="single_target")

    send = await client.post(
        "/api/admin/notifications/send",
        json={
            "pool": "passenger",
            "mode": "single",
            "recipientId": "304",
            "title": "Personal note",
            "body": "Only for you.",
            "sendTelegram": False,
        },
    )
    assert send.status_code == 200
    assert send.json()["sentCount"] == 1

    inbox = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert inbox.status_code == 200
    assert inbox.json()["total"] == 1
    assert inbox.json()["items"][0]["title"] == "Personal note"


@patch("app.services.notification_service._send_telegram_text", new_callable=AsyncMock)
async def test_admin_send_with_telegram_flag(mock_send, client):
    await _admin_login(client)
    await _passenger_token(client, user_id="305", username="tg_target")

    send = await client.post(
        "/api/admin/notifications/send",
        json={
            "pool": "passenger",
            "mode": "single",
            "recipientId": "305",
            "title": "TG title",
            "body": "TG body",
            "sendTelegram": True,
        },
    )
    assert send.status_code == 200
    mock_send.assert_awaited()


async def test_mark_read_and_unread_count(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="306", username="read_me")

    await client.post(
        "/api/admin/notifications/send",
        json={
            "pool": "passenger",
            "mode": "single",
            "recipientId": "306",
            "title": "Read test",
            "body": "Please read.",
            "sendTelegram": False,
        },
    )

    inbox = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token}"},
    )
    notification_id = inbox.json()["items"][0]["id"]

    unread_before = await client.get(
        "/api/notifications/passenger/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert unread_before.json()["count"] == 1

    marked = await client.patch(
        f"/api/notifications/passenger/{notification_id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert marked.status_code == 200
    assert marked.json()["readAt"] is not None

    unread_after = await client.get(
        "/api/notifications/passenger/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert unread_after.json()["count"] == 0


async def test_passenger_cannot_read_foreign_notification(client):
    await _admin_login(client)
    token_a = await _passenger_token(client, user_id="307", username="owner")
    token_b = await _passenger_token(client, user_id="308", username="other")

    await client.post(
        "/api/admin/notifications/send",
        json={
            "pool": "passenger",
            "mode": "single",
            "recipientId": "307",
            "title": "Private",
            "body": "Secret",
            "sendTelegram": False,
        },
    )

    inbox_a = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    notification_id = inbox_a.json()["items"][0]["id"]

    forbidden = await client.patch(
        f"/api/notifications/passenger/{notification_id}/read",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert forbidden.status_code == 404


async def test_moderator_cannot_send_notifications(client):
    await _admin_login(client)
    moderator_key = await _create_admin_key(client, name="Notify Moderator", role="moderator")

    logout = await client.post("/api/admin/session/logout")
    assert logout.status_code == 200

    login = await client.post("/api/admin/session/login", json={"key": moderator_key})
    assert login.status_code == 200

    send = await client.post(
        "/api/admin/notifications/send",
        json={
            "pool": "passenger",
            "mode": "broadcast",
            "title": "Blocked",
            "body": "Should fail",
            "sendTelegram": False,
        },
    )
    assert send.status_code == 403
