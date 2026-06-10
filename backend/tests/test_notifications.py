from __future__ import annotations

import json

from tests.test_auth import _make_tg_init_data
from tests.test_driver_registration import _admin_login, _passenger_token


def _info_block_payload(
    *,
    title_lt: str = "Title",
    title_en: str | None = None,
    body_lt: str = "Body",
    body_en: str | None = None,
    **extra,
):
    return {
        "titleI18n": {
            "lt": title_lt,
            "en": title_en or title_lt,
        },
        "bodyI18n": {
            "lt": body_lt,
            "en": body_en or body_lt,
        },
        **extra,
    }


async def _passenger_token_with_language(
    client,
    *,
    user_id: str,
    username: str,
    language_code: str,
) -> str:
    init_data = _make_tg_init_data(
        bot_token="test-bot-token",
        user_id=user_id,
        username=username,
        extra={"user": json.dumps({"id": int(user_id), "username": username, "language_code": language_code}, separators=(",", ":"))},
    )
    response = await client.post("/api/auth", json={"initData": init_data})
    assert response.status_code == 200
    return response.json()["access_token"]


async def test_admin_notification_respects_lang_query(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="309", username="lang_admin_notif")

    submit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "ru",
            "answers": {
                "full_name": "Lang Admin Driver",
                "car_brand": "Toyota",
                "car_model": "Camry",
                "car_plate": "LANG309",
                "vehicle_color": "White",
            },
            "files": {},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit.status_code == 200

    listed_ru = await client.get("/api/admin/notifications?lang=ru")
    assert listed_ru.status_code == 200
    match = next(item for item in listed_ru.json()["items"] if item["type"] == "driver_application_new")
    assert match["title"] == "Новая заявка водителя"
    assert "Lang Admin Driver" in match["body"]

    listed_en = await client.get("/api/admin/notifications?lang=en")
    assert listed_en.status_code == 200
    match_en = next(item for item in listed_en.json()["items"] if item["id"] == match["id"])
    assert match_en["title"] == "New driver application"


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


async def test_info_block_visible_to_all_passengers_and_new_user(client):
    await _admin_login(client)
    token_a = await _passenger_token(client, user_id="302", username="passenger_a")

    created = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(
            pool="passenger",
            title_lt="Welcome",
            body_lt="Read this before your first ride.",
        ),
    )
    assert created.status_code == 201
    block_id = created.json()["id"]

    inbox_a = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert inbox_a.status_code == 200
    assert any(item["id"] == block_id and item["type"] == "info_block" for item in inbox_a.json()["items"])

    token_b = await _passenger_token(client, user_id="303", username="passenger_b_new")
    inbox_b = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert inbox_b.status_code == 200
    assert any(item["id"] == block_id for item in inbox_b.json()["items"])
    assert inbox_b.json()["items"][0]["readAt"] is None


async def test_info_block_resolves_passenger_language(client):
    await _admin_login(client)
    token = await _passenger_token_with_language(
        client,
        user_id="308",
        username="english_user",
        language_code="en-US",
    )

    created = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(
            pool="passenger",
            title_lt="Sveiki",
            title_en="Hello",
            body_lt="Lietuviškas tekstas",
            body_en="English text",
        ),
    )
    assert created.status_code == 201
    block_id = created.json()["id"]

    inbox = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert inbox.status_code == 200
    item = next(row for row in inbox.json()["items"] if row["id"] == block_id)
    assert item["title"] == "Hello"
    assert item["body"] == "English text"


async def test_mark_info_block_read(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="304", username="read_me")

    created = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(pool="passenger", title_lt="Rules", body_lt="Please follow them."),
    )
    block_id = created.json()["id"]

    unread_before = await client.get(
        "/api/notifications/passenger/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert unread_before.json()["count"] == 1

    marked = await client.patch(
        f"/api/notifications/passenger/{block_id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert marked.status_code == 200
    assert marked.json()["readAt"] is not None

    unread_after = await client.get(
        "/api/notifications/passenger/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert unread_after.json()["count"] == 0


async def test_delete_info_block_removes_from_pool(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="305", username="delete_block")

    created = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(pool="passenger", title_lt="Temp", body_lt="Goes away."),
    )
    block_id = created.json()["id"]

    deleted = await client.delete(f"/api/admin/info-blocks/{block_id}")
    assert deleted.status_code == 204

    inbox = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert inbox.status_code == 200
    assert not any(item["id"] == block_id for item in inbox.json()["items"])


async def test_targeted_info_block_visible_only_to_username(client):
    await _admin_login(client)
    token_target = await _passenger_token(client, user_id="306", username="only_me")
    token_other = await _passenger_token(client, user_id="307", username="someone_else")

    created = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(
            pool="passenger",
            title_lt="Personal",
            body_lt="Only for @only_me",
            audience="user",
            targetUsername="@only_me",
        ),
    )
    assert created.status_code == 201
    block_id = created.json()["id"]
    assert created.json()["targetUsername"] == "only_me"

    inbox_target = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_target}"},
    )
    assert inbox_target.status_code == 200
    assert any(item["id"] == block_id for item in inbox_target.json()["items"])

    inbox_other = await client.get(
        "/api/notifications/passenger",
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert inbox_other.status_code == 200
    assert not any(item["id"] == block_id for item in inbox_other.json()["items"])


async def test_targeted_info_block_rejects_unknown_username(client):
    await _admin_login(client)

    created = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(
            pool="passenger",
            title_lt="Missing user",
            body_lt="Nobody",
            audience="user",
            targetUsername="@ghost_user",
        ),
    )
    assert created.status_code == 400
    assert created.json()["detail"] == "User not found."


async def test_moderator_cannot_manage_info_blocks(client):
    await _admin_login(client)
    created_key = await client.post(
        "/api/admin/keys",
        json={"name": "Moderator", "role": "moderator"},
    )
    moderator_key = created_key.json()["key"]

    await client.post("/api/admin/session/logout")
    login = await client.post("/api/admin/session/login", json={"key": moderator_key})
    assert login.status_code == 200

    blocked = await client.post(
        "/api/admin/info-blocks",
        json=_info_block_payload(pool="passenger", title_lt="Nope", body_lt="Nope"),
    )
    assert blocked.status_code == 403
