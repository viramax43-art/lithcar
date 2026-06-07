from __future__ import annotations

from tests.test_auth import _make_tg_init_data


async def _passenger_token(client, *, user_id: str = "200", username: str = "driver_applicant") -> str:
    init_data = _make_tg_init_data(bot_token="test-bot-token", user_id=user_id, username=username)
    response = await client.post("/api/auth", json={"initData": init_data})
    assert response.status_code == 200
    return response.json()["access_token"]


async def _admin_login(client):
    response = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert response.status_code == 200


async def test_public_form_schema_returns_default_fields(client):
    response = await client.get("/api/driver-registration/form")
    assert response.status_code == 200
    body = response.json()
    assert len(body["fields"]) >= 1
    assert body["fields"][0]["id"]


async def test_submit_application_requires_auth(client):
    response = await client.post(
        "/api/driver-registration/applications",
        json={"language": "ru", "answers": {"full_name": "Test Driver"}},
    )
    assert response.status_code == 401


async def test_submit_and_approve_application_creates_driver_with_user_id(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="201", username="approve_me")

    submit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "ru",
            "answers": {
                "full_name": "Ivan Driver",
                "car_brand": "Toyota",
                "car_model": "Camry",
                "car_plate": "ABC123",
                "vehicle_color": "Black",
                "about": "Experienced driver",
            },
            "files": {},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit.status_code == 200
    application_id = submit.json()["id"]
    assert submit.json()["status"] == "pending"
    assert submit.json()["userId"] == "201"

    duplicate = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "ru",
            "answers": {
                "full_name": "Again",
                "car_brand": "Toyota",
                "car_model": "Camry",
                "car_plate": "ABC123",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert duplicate.status_code == 409

    approve = await client.post(f"/api/driver-registration/applications/{application_id}/approve")
    assert approve.status_code == 200
    approve_body = approve.json()
    assert approve_body["key"].startswith("ride_driver_")
    assert approve_body["application"]["status"] == "approved"
    assert approve_body["application"]["createdDriverId"]

    drivers = await client.get("/api/drivers")
    assert drivers.status_code == 200
    created = next(item for item in drivers.json()["items"] if item["userId"] == "201")
    assert created["name"] == "Ivan Driver"
    assert created["carBrand"] == "Toyota"
    assert created["carModel"] == "Camry"
    assert created["carPlate"] == "ABC123"


async def test_reject_application_with_reason_and_allow_resubmit(client):
    await _admin_login(client)
    token = await _passenger_token(client, user_id="202", username="reject_me")

    submit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "en",
            "answers": {
                "full_name": "Rejected Driver",
                "car_brand": "BMW",
                "car_model": "X5",
                "car_plate": "ZZZ999",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit.status_code == 200
    application_id = submit.json()["id"]

    reject = await client.post(
        f"/api/driver-registration/applications/{application_id}/reject",
        json={"rejectionReason": "Incomplete documents"},
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"
    assert reject.json()["rejectionReason"] == "Incomplete documents"

    resubmit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "en",
            "answers": {
                "full_name": "Rejected Driver Retry",
                "car_brand": "BMW",
                "car_model": "X5",
                "car_plate": "ZZZ999",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resubmit.status_code == 200
    assert resubmit.json()["status"] == "pending"


async def test_required_field_validation(client):
    token = await _passenger_token(client, user_id="203", username="invalid")

    response = await client.post(
        "/api/driver-registration/applications",
        json={"language": "lt", "answers": {}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400


async def test_get_my_application_endpoint(client):
    token = await _passenger_token(client, user_id="204", username="status_check")

    empty = await client.get(
        "/api/driver-registration/applications/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert empty.status_code == 200
    assert empty.json() is None

    submit = await client.post(
        "/api/driver-registration/applications",
        json={
            "language": "pl",
            "answers": {
                "full_name": "Status Driver",
                "car_brand": "Audi",
                "car_model": "A4",
                "car_plate": "AUD111",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit.status_code == 200

    mine = await client.get(
        "/api/driver-registration/applications/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert mine.status_code == 200
    assert mine.json()["status"] == "pending"
    assert mine.json()["answers"]["full_name"] == "Status Driver"
