from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import UserRole

def _make_tg_init_data(*, bot_token: str, user_id: str, username: str | None = None, extra: dict[str, str] | None = None) -> str:
    """
    Генерирует валидную строку initData для validate_tg_data().
    Формат/хеширование соответствует app.core.security.validate_tg_data.
    """
    user_payload = {"id": int(user_id)}
    if username is not None:
        user_payload["username"] = username

    data: dict[str, str] = {
        "auth_date": str(int(time.time())),
        "query_id": "test-query-id",
        "user": json.dumps(user_payload, separators=(",", ":")),
    }
    if extra:
        data.update(extra)

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode(),
        digestmod=hashlib.sha256,
    ).digest()

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    data["hash"] = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    # Важно: user содержит JSON, поэтому должен быть корректно url-encoded
    return urlencode(data)


async def test_auth_login_valid_initdata_returns_token_and_users_me_works(client):
    init_data = _make_tg_init_data(bot_token="test-bot-token", user_id="100", username="alice")

    r = await client.post("/api/auth", json={"initData": init_data})
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert isinstance(token, str) and token

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["user_id"] == "100"
    assert body["username"] == "alice"
    assert body["role"] == UserRole.PASSENGER


async def test_auth_invalid_hash_returns_400(client):
    init_data = _make_tg_init_data(bot_token="test-bot-token", user_id="101", username="bob")
    init_data = init_data.replace("hash=", "hash=deadbeef")  # гарантированно ломаем подпись

    r = await client.post("/api/auth", json={"initData": init_data})
    assert r.status_code == 400


async def test_auth_missing_user_in_initdata_returns_400(client):
    # Валидная подпись, но без поля user -> auth_service должен вернуть 400
    init_data = _make_tg_init_data(
        bot_token="test-bot-token",
        user_id="102",
        username="tmp",
        extra={"user": ""},  # user будет пустым
    )

    r = await client.post("/api/auth", json={"initData": init_data})
    assert r.status_code == 400


async def test_users_me_invalid_token_returns_401(client):
    r = await client.get("/api/users/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


async def test_users_me_token_for_missing_user_returns_401(client):
    from app.core.security import create_access_token

    token = create_access_token(subject="missing-user-id", role=UserRole.PASSENGER)
    r = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_auth_login_updates_username_if_changed(client):
    init_data_1 = _make_tg_init_data(bot_token="test-bot-token", user_id="200", username="alice")
    r1 = await client.post("/api/auth", json={"initData": init_data_1})
    assert r1.status_code == 200

    init_data_2 = _make_tg_init_data(bot_token="test-bot-token", user_id="200", username="alice_renamed")
    r2 = await client.post("/api/auth", json={"initData": init_data_2})
    assert r2.status_code == 200
    token2 = r2.json()["access_token"]

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token2}"})
    assert me.status_code == 200
    assert me.json()["username"] == "alice_renamed"


async def test_non_admin_forbidden_for_admin_endpoints(client):
    init_data = _make_tg_init_data(bot_token="test-bot-token", user_id="300", username="passenger")
    auth = await client.post("/api/auth", json={"initData": init_data})
    token = auth.json()["access_token"]

    response = await client.get(
        "/api/ride-requests",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401


async def test_user_cabinet_returns_balance_and_ride_history(client, db_session):
    init_data = _make_tg_init_data(bot_token="test-bot-token", user_id="401", username="cabinet_user")
    auth = await client.post("/api/auth", json={"initData": init_data})
    assert auth.status_code == 200
    token = auth.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ride = RideRequest(
        passenger_id="401",
        passenger_name="Cabinet User",
        passenger_phone="+37060000111",
        from_address="A",
        from_lat=54.69,
        from_lng=25.27,
        to_address="B",
        to_lat=54.7,
        to_lng=25.28,
        date_time=datetime.now(timezone.utc),
        status=RideRequestStatus.COMPLETED,
    )
    db_session.add(ride)
    await db_session.commit()

    cabinet = await client.get("/api/users/me/cabinet", headers=headers)
    assert cabinet.status_code == 200
    body = cabinet.json()
    assert body["pointsBalance"] == 0
    assert len(body["rideHistory"]) == 1
    assert body["rideHistory"][0]["status"] == RideRequestStatus.COMPLETED


