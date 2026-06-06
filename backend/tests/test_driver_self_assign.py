from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token
from app.models.user import User, UserRole


async def _create_zone(client):
    login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert login.status_code == 200
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Vilnius self-assign",
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


async def _create_self_assign_driver(client, *, can_self_assign: bool = True):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200
    created = await client.post(
        "/api/drivers",
        json={
            "name": "Self Assign Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "SA001",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-SA",
            "about": "",
            "rating": 5.0,
            "isOnline": True,
            "canSelfAssign": can_self_assign,
        },
    )
    assert created.status_code == 200
    payload = created.json()
    return payload["driver"]["id"], payload["key"]


async def _create_pending_request(client, db_session):
    passenger = User(
        user_id="passenger-self-assign",
        username="self_assign_passenger",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(subject=passenger.user_id, role=passenger.role)}"}
    created = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Self Assign Passenger",
            "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
        },
        headers=headers,
    )
    assert created.status_code == 201
    return created.json()["id"]


async def test_driver_without_self_assign_flag_cannot_claim(client, db_session):
    await _create_zone(client)
    driver_id, driver_key = await _create_self_assign_driver(client, can_self_assign=False)
    request_id = await _create_pending_request(client, db_session)

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    assert login.json()["canSelfAssign"] is False

    claim = await client.post(f"/api/driver/cabinet/rides/{request_id}/claim")
    assert claim.status_code == 403

    map_data = await client.get("/api/driver/cabinet/map")
    assert map_data.status_code == 200
    assert map_data.json()["availablePoints"] == []


async def test_driver_with_self_assign_sees_available_points_and_can_claim(client, db_session):
    await _create_zone(client)
    driver_id, driver_key = await _create_self_assign_driver(client, can_self_assign=True)
    request_id = await _create_pending_request(client, db_session)

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    assert login.json()["canSelfAssign"] is True

    map_before = await client.get("/api/driver/cabinet/map")
    assert map_before.status_code == 200
    body = map_before.json()
    available = body["availablePoints"]
    assert len(available) >= 2
    assert all(point["pointKind"] == "available" for point in available)
    assert any(point["rideId"] == request_id for point in available)

    claim = await client.post(f"/api/driver/cabinet/rides/{request_id}/claim")
    assert claim.status_code == 200
    assert claim.json()["status"] == "assigned"
    assert claim.json()["id"] == request_id

    map_after = await client.get("/api/driver/cabinet/map")
    assert map_after.status_code == 200
    mine_ids = {point["rideId"] for point in map_after.json()["points"]}
    assert request_id in mine_ids
    available_after = [p for p in map_after.json()["availablePoints"] if p["rideId"] == request_id]
    assert available_after == []


async def test_claim_already_assigned_ride_returns_conflict(client, db_session):
    await _create_zone(client)
    driver_a_id, driver_a_key = await _create_self_assign_driver(client, can_self_assign=True)
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200
    created_b = await client.post(
        "/api/drivers",
        json={
            "name": "Driver B",
            "carBrand": "Toyota",
            "carModel": "Yaris",
            "carPlate": "SA002",
            "vehicleColor": "Red",
            "seatsCount": 4,
            "licenseNumber": "LIC-SB",
            "about": "",
            "rating": 5.0,
            "isOnline": True,
            "canSelfAssign": True,
        },
    )
    assert created_b.status_code == 200
    driver_b_key = created_b.json()["key"]
    request_id = await _create_pending_request(client, db_session)

    assigned = await client.patch(
        f"/api/ride-requests/{request_id}/assign",
        json={"driverId": driver_a_id},
    )
    assert assigned.status_code == 200

    login_b = await client.post("/api/driver/session/login", json={"key": driver_b_key})
    assert login_b.status_code == 200

    claim = await client.post(f"/api/driver/cabinet/rides/{request_id}/claim")
    assert claim.status_code == 409
