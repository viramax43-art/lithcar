from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token
from app.models.driver import Driver
from app.models.user import User, UserRole


async def _create_zone(client):
    login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert login.status_code == 200
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Vilnius center",
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


async def test_driver_key_login_and_cabinet_contains_assigned_rides(client, db_session):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200

    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": "Driver One",
            "carBrand": "Toyota",
            "carModel": "Prius",
            "carPlate": "AAA001",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-777",
            "about": "Test driver",
            "rating": 4.9,
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]
    assert driver_key.startswith("ride_driver_")

    passenger = User(
        user_id="passenger-driver-test",
        username="passenger",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()

    await _create_zone(client)
    passenger_token = create_access_token(subject=passenger.user_id, role=passenger.role)
    passenger_headers = {"Authorization": f"Bearer {passenger_token}"}
    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Passenger",
            "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=passenger_headers,
    )
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]

    assigned = await client.patch(f"/api/ride-requests/{request_id}/assign", json={"driverId": driver_id})
    assert assigned.status_code == 200

    driver_login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert driver_login.status_code == 200

    cabinet = await client.get("/api/driver/cabinet")
    assert cabinet.status_code == 200
    body = cabinet.json()
    assert body["session"]["driverId"] == driver_id
    assert body["total"] >= 1
    assert any(item["id"] == request_id for item in body["rides"])


async def test_driver_session_returns_can_sell_points_flag(client):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200

    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": "Driver Points",
            "carBrand": "BMW",
            "carModel": "X3",
            "carPlate": "BBB002",
            "vehicleColor": "Black",
            "seatsCount": 4,
            "licenseNumber": "LIC-888",
            "about": "",
            "rating": 5.0,
            "isOnline": False,
            "canSellPoints": True,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]

    login_driver = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login_driver.status_code == 200
    assert login_driver.json()["canSellPoints"] is True

    rotated = await client.post(f"/api/drivers/{driver_id}/rotate-key")
    assert rotated.status_code == 200
    new_key = rotated.json()["key"]
    assert new_key.startswith("ride_driver_")

    old_login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert old_login.status_code == 401

    new_login = await client.post("/api/driver/session/login", json={"key": new_key})
    assert new_login.status_code == 200


async def test_driver_online_heartbeat_is_visible_and_expires(client, db_session):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200

    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": "Driver Heartbeat",
            "carBrand": "Audi",
            "carModel": "A4",
            "carPlate": "CCC003",
            "vehicleColor": "Gray",
            "seatsCount": 4,
            "licenseNumber": "LIC-999",
            "about": "",
            "rating": 5.0,
            "isOnline": False,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]

    login_driver = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login_driver.status_code == 200

    heartbeat = await client.patch("/api/driver/cabinet/online", json={"isOnline": True})
    assert heartbeat.status_code == 200

    online_after_heartbeat = await client.get("/api/drivers?onlineOnly=true")
    assert online_after_heartbeat.status_code == 200
    assert any(item["id"] == driver_id for item in online_after_heartbeat.json()["items"])

    driver = await db_session.get(Driver, driver_id)
    assert driver is not None
    driver.is_online = True
    driver.last_seen_at = datetime.now(timezone.utc) - timedelta(minutes=2)
    await db_session.commit()

    online_after_timeout = await client.get("/api/drivers?onlineOnly=true")
    assert online_after_timeout.status_code == 200
    assert all(item["id"] != driver_id for item in online_after_timeout.json()["items"])
