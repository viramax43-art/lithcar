from __future__ import annotations


async def test_admin_session_login_with_bootstrap_key(client):
    response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "chief_admin"
    assert "set-cookie" in {k.lower(): v for k, v in response.headers.items()}

    me = await client.get("/api/admin/session/me")
    assert me.status_code == 200
    assert me.json()["role"] == "chief_admin"


async def test_chief_admin_can_create_and_revoke_key(client):
    login = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login.status_code == 200

    created = await client.post(
        "/api/admin/keys",
        json={"name": "Support Moderator", "role": "moderator"},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["item"]["role"] == "moderator"
    assert body["key"].startswith("ride_moderator_")
    key_id = body["item"]["id"]

    listed = await client.get("/api/admin/keys")
    assert listed.status_code == 200
    assert any(item["id"] == key_id for item in listed.json()["items"])

    revoked = await client.post(f"/api/admin/keys/{key_id}/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["isActive"] is False

    rotated = await client.post(f"/api/admin/keys/{key_id}/rotate")
    assert rotated.status_code == 200
    assert rotated.json()["item"]["id"] == key_id
    assert rotated.json()["key"].startswith("ride_")


async def test_non_chief_cannot_manage_keys(client):
    chief_login = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert chief_login.status_code == 200

    created = await client.post(
        "/api/admin/keys",
        json={"name": "Regular Admin", "role": "admin"},
    )
    assert created.status_code == 200
    admin_key = created.json()["key"]

    await client.post("/api/admin/session/logout")

    admin_login = await client.post("/api/admin/session/login", json={"key": admin_key})
    assert admin_login.status_code == 200
    assert admin_login.json()["role"] == "admin"

    forbidden = await client.get("/api/admin/keys")
    assert forbidden.status_code == 403


async def test_chief_admin_account_is_not_deletable(client):
    login = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login.status_code == 200

    listed = await client.get("/api/admin/keys")
    assert listed.status_code == 200
    chief = next(item for item in listed.json()["items"] if item["role"] == "chief_admin")

    revoke = await client.post(f'/api/admin/keys/{chief["id"]}/revoke')
    assert revoke.status_code == 400

    delete = await client.delete(f'/api/admin/keys/{chief["id"]}')
    assert delete.status_code == 400


async def test_delete_admin_key_removes_record_from_database_list(client):
    login = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login.status_code == 200

    created = await client.post(
        "/api/admin/keys",
        json={"name": "Delete Me", "role": "admin"},
    )
    assert created.status_code == 200
    key_id = created.json()["item"]["id"]

    deleted = await client.delete(f"/api/admin/keys/{key_id}")
    assert deleted.status_code == 200
    assert deleted.json()["id"] == key_id

    listed = await client.get("/api/admin/keys")
    assert listed.status_code == 200
    assert not any(item["id"] == key_id for item in listed.json()["items"])
