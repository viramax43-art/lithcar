from __future__ import annotations


async def _chief_session(client) -> None:
    login = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login.status_code == 200


async def _link_staff(client, *, name: str, role: str, telegram_username: str) -> str:
    created = await client.post(
        "/api/admin/keys",
        json={"name": name, "role": role, "telegramUsername": telegram_username},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["item"]["telegramUsername"] == telegram_username.strip().lstrip("@").lower()
    return body["item"]["id"]


async def test_staff_key_creation_stores_telegram_username(client):
    await _chief_session(client)
    key_id = await _link_staff(client, name="Armian", role="admin", telegram_username="@ProgerArm")

    listed = await client.get("/api/admin/keys")
    assert listed.status_code == 200
    item = next(row for row in listed.json()["items"] if row["id"] == key_id)
    assert item["telegramUsername"] == "progerarm"
    assert item["telegramUserId"] is None


async def test_staff_can_login_from_mini_app_with_init_data(client):
    await _chief_session(client)
    await _link_staff(client, name="Armian", role="admin", telegram_username="progerarm")
    await client.post("/api/admin/session/logout")

    bootstrap = await client.post(
        "/api/v1/admin/session/bootstrap",
        json={"initData": "test:1327953308:Armian:progerarm"},
    )
    assert bootstrap.status_code == 200
    assert bootstrap.json()["role"] == "admin"
    assert bootstrap.json()["name"] == "Armian"

    me = await client.get("/api/admin/session/me")
    assert me.status_code == 200
    assert me.json()["role"] == "admin"

    # Telegram user id is remembered on the first successful Mini App login.
    await _chief_session(client)
    listed = await client.get("/api/admin/keys")
    item = next(row for row in listed.json()["items"] if row["name"] == "Armian")
    assert item["telegramUserId"] == "1327953308"


async def test_staff_can_login_from_mini_app_with_passenger_session(client):
    await _chief_session(client)
    await _link_staff(client, name="Armian", role="admin", telegram_username="progerarm")
    await client.post("/api/admin/session/logout")

    # The passenger cookie of the same Telegram account authenticates the staff sign-in.
    auth = await client.post(
        "/api/auth",
        json={"initData": "test:1327953308:Armian:progerarm"},
    )
    assert auth.status_code == 200

    bootstrap = await client.post("/api/v1/admin/session/bootstrap", json={})
    assert bootstrap.status_code == 200
    assert bootstrap.json()["role"] == "admin"


async def test_unlinked_telegram_account_gets_403(client):
    await _chief_session(client)
    await _link_staff(client, name="Armian", role="admin", telegram_username="progerarm")
    await client.post("/api/admin/session/logout")

    bootstrap = await client.post(
        "/api/v1/admin/session/bootstrap",
        json={"initData": "test:999001:Stranger:stranger"},
    )
    assert bootstrap.status_code == 403
    assert bootstrap.json()["detail"]["code"] == "admin_not_linked"


async def test_telegram_login_requires_identity(client):
    bootstrap = await client.post("/api/v1/admin/session/bootstrap", json={})
    assert bootstrap.status_code == 401


async def test_revoked_staff_cannot_login_from_mini_app(client):
    await _chief_session(client)
    key_id = await _link_staff(client, name="Armian", role="admin", telegram_username="progerarm")
    revoked = await client.post(f"/api/admin/keys/{key_id}/revoke")
    assert revoked.status_code == 200
    await client.post("/api/admin/session/logout")

    bootstrap = await client.post(
        "/api/v1/admin/session/bootstrap",
        json={"initData": "test:1327953308:Armian:progerarm"},
    )
    assert bootstrap.status_code == 403


async def test_unbind_telegram_username_blocks_login(client):
    await _chief_session(client)
    key_id = await _link_staff(client, name="Armian", role="admin", telegram_username="progerarm")

    unbound = await client.patch(f"/api/admin/keys/{key_id}", json={"telegramUsername": ""})
    assert unbound.status_code == 200
    assert unbound.json()["telegramUsername"] is None

    await client.post("/api/admin/session/logout")
    bootstrap = await client.post(
        "/api/v1/admin/session/bootstrap",
        json={"initData": "test:1327953308:Armian:progerarm"},
    )
    assert bootstrap.status_code == 403


async def test_admin_access_endpoint_reports_mini_app_visibility(client):
    await _chief_session(client)
    await _link_staff(client, name="Armian", role="admin", telegram_username="progerarm")
    await client.post("/api/admin/session/logout")

    auth = await client.post("/api/auth", json={"initData": "test:1327953308:Armian:progerarm"})
    assert auth.status_code == 200
    token = auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    access = await client.get("/api/v1/admin/session/access", headers=headers)
    assert access.status_code == 200
    body = access.json()
    assert body["isAdmin"] is True
    assert body["role"] == "admin"
    assert body["telegramUsername"] == "progerarm"


async def test_admin_access_endpoint_is_false_for_regular_passenger(client):
    auth = await client.post("/api/auth", json={"initData": "test:555001:Passenger:passenger_x"})
    assert auth.status_code == 200
    token = auth.json()["access_token"]

    access = await client.get(
        "/api/v1/admin/session/access",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert access.status_code == 200
    assert access.json()["isAdmin"] is False
