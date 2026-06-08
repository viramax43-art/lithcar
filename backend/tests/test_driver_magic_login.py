from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.core.config import settings
from tests.test_auth import _make_tg_init_data


async def _passenger_token(client, *, user_id: str, username: str = "driver_user") -> str:
    init_data = _make_tg_init_data(bot_token="test-bot-token", user_id=user_id, username=username)
    response = await client.post("/api/auth", json={"initData": init_data})
    assert response.status_code == 200
    return response.json()["access_token"]


async def _admin_login(client) -> None:
    response = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert response.status_code == 200


async def _submit_application(client, *, user_id: str) -> str:
    token = await _passenger_token(client, user_id=user_id)
    submit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "ru",
            "answers": {
                "full_name": "Magic Driver",
                "car_brand": "Toyota",
                "car_model": "Camry",
                "car_plate": "MAG123",
                "vehicle_color": "White",
            },
            "files": {},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit.status_code == 200
    return submit.json()["id"]


async def _approve_and_capture_enter_url(client, application_id: str) -> str:
    with patch(
        "app.api.driver_registration.notify_driver_application_approved",
        new_callable=AsyncMock,
    ) as notify_mock:
        approve = await client.post(f"/api/driver-registration/applications/{application_id}/approve")
        assert approve.status_code == 200
        notify_mock.assert_awaited_once()
        return notify_mock.await_args.kwargs["enter_url"]


def _extract_token_from_enter_url(enter_url: str) -> str:
    return enter_url.rsplit("/", 1)[-1]


async def test_magic_login_sets_session_and_is_single_use(client):
    await _admin_login(client)
    application_id = await _submit_application(client, user_id="301")
    enter_url = await _approve_and_capture_enter_url(client, application_id)
    token = _extract_token_from_enter_url(enter_url)

    first = await client.get(f"/api/driver/session/enter/{token}", follow_redirects=False)
    assert first.status_code == 302
    assert first.headers["location"].endswith("/driver")
    assert settings.driver_session_cookie_name in first.cookies

    session = await client.get("/api/driver/session/me")
    assert session.status_code == 200
    assert session.json()["name"] == "Magic Driver"

    second = await client.get(f"/api/driver/session/enter/{token}", follow_redirects=False)
    assert second.status_code == 401


async def test_bootstrap_driver_access_from_passenger_session(client):
    await _admin_login(client)
    application_id = await _submit_application(client, user_id="302")
    await _approve_and_capture_enter_url(client, application_id)

    passenger_token = await _passenger_token(client, user_id="302")
    bootstrap = await client.post(
        "/api/driver-registration/driver-access/bootstrap",
        headers={"Authorization": f"Bearer {passenger_token}"},
    )
    assert bootstrap.status_code == 200
    body = bootstrap.json()
    assert body["name"] == "Magic Driver"
    assert settings.driver_session_cookie_name in bootstrap.cookies

    session = await client.get("/api/driver/session/me")
    assert session.status_code == 200
    assert session.json()["driverId"] == body["driverId"]


async def test_bootstrap_driver_access_requires_driver_profile(client):
    token = await _passenger_token(client, user_id="303")
    response = await client.post(
        "/api/driver-registration/driver-access/bootstrap",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
