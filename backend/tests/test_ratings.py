"""Tests for post-ride bidirectional ratings."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token
from app.models.driver import Driver
from app.models.user import User, UserRole


def _headers_for(user_id: str, role: str) -> dict[str, str]:
    token = create_access_token(subject=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


async def _create_zone(client):
    response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert response.status_code == 200
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Ratings test zone",
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


async def _setup_completed_ride(client, db_session):
    await _create_zone(client)

    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": "Rating Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "RTG001",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-RTG",
            "about": "",
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]

    passenger = User(
        user_id="passenger-rating-test",
        username="rating_passenger",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()

    passenger_headers = _headers_for(passenger.user_id, passenger.role)
    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Rating Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=passenger_headers,
    )
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]

    assigned = await client.patch(
        f"/api/ride-requests/{request_id}/assign",
        json={"driverId": driver_id},
    )
    assert assigned.status_code == 200

    driver_login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert driver_login.status_code == 200

    for status in ("en_route_to_pickup", "awaiting_passenger", "in_progress"):
        response = await client.patch(
            f"/api/driver/cabinet/rides/{request_id}/status",
            json={"status": status},
        )
        assert response.status_code == 200

    completed = await client.patch(
        f"/api/driver/cabinet/points/{request_id}/dropoff/action",
        json={"action": "arrived"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    return {
        "driver_id": driver_id,
        "passenger": passenger,
        "passenger_headers": passenger_headers,
        "request_id": request_id,
    }


async def _advance_to_assigned(client, ctx):
    for status in ("en_route_to_pickup", "awaiting_passenger", "in_progress"):
        response = await client.patch(
            f"/api/driver/cabinet/rides/{ctx['request_id']}/status",
            json={"status": status},
        )
        assert response.status_code == 200


async def test_passenger_cannot_rate_before_completed(client, db_session):
    ctx = await _setup_completed_ride(client, db_session)
    # Create another pending ride
    created = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Pending",
            "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
        },
        headers=ctx["passenger_headers"],
    )
    pending_id = created.json()["id"]
    response = await client.post(
        f"/api/ride-requests/{pending_id}/rate",
        json={"score": 5},
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 400


async def test_passenger_rates_driver_and_recalculates(client, db_session):
    ctx = await _setup_completed_ride(client, db_session)

    rate = await client.post(
        f"/api/ride-requests/{ctx['request_id']}/rate",
        json={"score": 4, "comment": "Хорошая поездка"},
        headers=ctx["passenger_headers"],
    )
    assert rate.status_code == 200
    body = rate.json()
    assert body["rating"]["canRate"] is False
    assert body["rating"]["myScore"] == 4
    assert body["rating"]["myComment"] == "Хорошая поездка"

    driver = await db_session.get(Driver, ctx["driver_id"])
    assert driver is not None
    assert driver.rating == 4.0

    duplicate = await client.post(
        f"/api/ride-requests/{ctx['request_id']}/rate",
        json={"score": 5},
        headers=ctx["passenger_headers"],
    )
    assert duplicate.status_code == 409


async def test_driver_rates_passenger_and_cabinet_reflects(client, db_session):
    ctx = await _setup_completed_ride(client, db_session)

    rate = await client.post(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/rate",
        json={"score": 3},
    )
    assert rate.status_code == 200
    assert rate.json()["rating"]["myScore"] == 3

    user = await db_session.get(User, ctx["passenger"].user_id)
    assert user is not None
    assert user.rating == 3.0

    cabinet = await client.get(
        "/api/users/me/cabinet",
        headers=ctx["passenger_headers"],
    )
    assert cabinet.status_code == 200
    cabinet_body = cabinet.json()
    assert cabinet_body["rating"] == 3.0
    assert cabinet_body["ratingCount"] == 1


async def test_driver_session_includes_rating(client, db_session):
    ctx = await _setup_completed_ride(client, db_session)
    await client.post(
        f"/api/ride-requests/{ctx['request_id']}/rate",
        json={"score": 5},
        headers=ctx["passenger_headers"],
    )

    session = await client.get("/api/driver/session/me")
    assert session.status_code == 200
    body = session.json()
    assert body["rating"] == 5.0
    assert body["ratingCount"] == 1


async def test_cabinet_history_can_rate_driver_flag(client, db_session):
    ctx = await _setup_completed_ride(client, db_session)

    cabinet = await client.get(
        "/api/users/me/cabinet",
        headers=ctx["passenger_headers"],
    )
    assert cabinet.status_code == 200
    history = cabinet.json()["rideHistory"]
    completed_item = next(item for item in history if item["id"] == ctx["request_id"])
    assert completed_item["canRateDriver"] is True

    await client.post(
        f"/api/ride-requests/{ctx['request_id']}/rate",
        json={"score": 4},
        headers=ctx["passenger_headers"],
    )

    cabinet2 = await client.get(
        "/api/users/me/cabinet",
        headers=ctx["passenger_headers"],
    )
    completed_item2 = next(item for item in cabinet2.json()["rideHistory"] if item["id"] == ctx["request_id"])
    assert completed_item2["canRateDriver"] is False


async def test_driver_average_from_multiple_ratings(client, db_session):
    ctx = await _setup_completed_ride(client, db_session)
    await client.post(
        f"/api/ride-requests/{ctx['request_id']}/rate",
        json={"score": 4},
        headers=ctx["passenger_headers"],
    )

    # Second completed ride
    created = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Rating Passenger 2",
            "fromPoint": {"address": "C", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "D", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        },
        headers=ctx["passenger_headers"],
    )
    request_id_2 = created.json()["id"]
    await client.patch(
        f"/api/ride-requests/{request_id_2}/assign",
        json={"driverId": ctx["driver_id"]},
    )
    await _advance_to_assigned(client, ctx | {"request_id": request_id_2})
    await client.patch(
        f"/api/driver/cabinet/points/{request_id_2}/dropoff/action",
        json={"action": "arrived"},
    )
    await client.post(
        f"/api/ride-requests/{request_id_2}/rate",
        json={"score": 2},
        headers=ctx["passenger_headers"],
    )

    driver = await db_session.get(Driver, ctx["driver_id"])
    assert driver is not None
    assert driver.rating == 3.0
