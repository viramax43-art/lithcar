"""Tests for driver pickup editing and passenger confirmation flow."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token
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
            "name": "Vilnius test zone",
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


async def _setup_driver_and_passenger(client, db_session):
    """Helper: create a driver, passenger, zone, ride request, assign driver."""
    await _create_zone(client)

    # Create driver
    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": "Pickup Driver",
            "phone": "+37060001001",
            "carBrand": "VW",
            "carModel": "Golf",
            "carPlate": "PKP001",
            "vehicleColor": "Blue",
            "seatsCount": 4,
            "licenseNumber": "LIC-PKP",
            "about": "",
            "rating": 4.8,
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]

    # Create passenger
    passenger = User(
        user_id="passenger-pickup-test",
        username="pickup_passenger",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()

    # Create ride request
    passenger_headers = _headers_for(passenger.user_id, passenger.role)
    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Pickup Passenger",
            "passengerPhone": "+37060001002",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=passenger_headers,
    )
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]

    # Assign driver
    assigned = await client.patch(
        f"/api/ride-requests/{request_id}/assign",
        json={"driverId": driver_id},
    )
    assert assigned.status_code == 200

    # Login driver
    driver_login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert driver_login.status_code == 200

    return {
        "driver_id": driver_id,
        "driver_key": driver_key,
        "passenger": passenger,
        "passenger_headers": passenger_headers,
        "request_id": request_id,
    }


async def test_driver_can_edit_pickup_point(client, db_session):
    """Driver edits pickup point and it reflects in the ride data."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    # Edit pickup
    response = await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={
            "fromAddress": "Дорога 15",
            "fromLat": 54.691,
            "fromLng": 25.271,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fromAddress"] == "Дорога 15"
    assert body["fromLatLng"]["lat"] == 54.691
    assert body["fromLatLng"]["lng"] == 25.271
    assert body["pickupChangedByDriver"] is True
    assert body["pickupConfirmedAt"] is None


async def test_driver_edit_pickup_resets_confirmation(client, db_session):
    """If driver edits pickup again after confirmation, confirmation is reset."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    # Driver edits pickup
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "First edit", "fromLat": 54.691, "fromLng": 25.271},
    )

    # Passenger confirms
    confirm_response = await client.post(
        f"/api/ride-requests/{ctx['request_id']}/confirm-pickup",
        headers=ctx["passenger_headers"],
    )
    assert confirm_response.status_code == 200
    assert confirm_response.json()["pickupConfirmedAt"] is not None

    # Driver edits again
    second_edit = await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "Second edit", "fromLat": 54.692, "fromLng": 25.272},
    )
    assert second_edit.status_code == 200
    assert second_edit.json()["pickupConfirmedAt"] is None
    assert second_edit.json()["pickupChangedByDriver"] is True
    assert second_edit.json()["fromAddress"] == "Second edit"


async def test_passenger_can_confirm_pickup(client, db_session):
    """Passenger can confirm a pickup point that was changed by driver."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    # Driver edits pickup
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "Edited Point", "fromLat": 54.691, "fromLng": 25.271},
    )

    # Passenger confirms
    response = await client.post(
        f"/api/ride-requests/{ctx['request_id']}/confirm-pickup",
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pickupConfirmedAt"] is not None
    assert body["pickupChangedByDriver"] is True


async def test_passenger_can_confirm_even_without_driver_edit(client, db_session):
    """Passenger can hit confirm-pickup even if driver didn't change it (no-op is fine)."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    response = await client.post(
        f"/api/ride-requests/{ctx['request_id']}/confirm-pickup",
        headers=ctx["passenger_headers"],
    )
    assert response.status_code == 200
    assert response.json()["pickupConfirmedAt"] is not None


async def test_driver_cannot_edit_pickup_of_other_drivers_ride(client, db_session):
    """Driver cannot edit pickup for a ride not assigned to them."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    # Create another driver and log in as them
    created_driver2 = await client.post(
        "/api/drivers",
        json={
            "name": "Other Driver",
            "phone": "+37060001003",
            "carBrand": "BMW",
            "carModel": "320",
            "carPlate": "OTH002",
            "vehicleColor": "Red",
            "seatsCount": 4,
            "licenseNumber": "LIC-OTH",
            "about": "",
            "rating": 4.5,
            "isOnline": True,
        },
    )
    assert created_driver2.status_code == 200
    other_key = created_driver2.json()["key"]

    # Logout first driver, login second
    await client.post("/api/driver/session/logout")
    login2 = await client.post("/api/driver/session/login", json={"key": other_key})
    assert login2.status_code == 200

    # Try to edit the first driver's ride
    response = await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "Hack attempt", "fromLat": 54.691, "fromLng": 25.271},
    )
    assert response.status_code == 404


async def test_driver_cannot_edit_pickup_outside_active_zone(client, db_session):
    """Driver cannot move pickup to a point outside active service zones."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    response = await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={
            "fromAddress": "Outside zone",
            "fromLat": 55.5,
            "fromLng": 26.5,
        },
    )
    assert response.status_code == 400
    assert "зон" in response.json()["detail"].lower()


async def test_driver_cannot_edit_pickup_after_ride_in_progress(client, db_session):
    """Driver cannot edit pickup once ride is in_progress or later."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    # Advance ride to en_route_to_pickup → awaiting_passenger → in_progress
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/status",
        json={"status": "en_route_to_pickup"},
    )
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/status",
        json={"status": "awaiting_passenger"},
    )
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/status",
        json={"status": "in_progress"},
    )

    # Try to edit pickup
    response = await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "Late edit", "fromLat": 54.691, "fromLng": 25.271},
    )
    assert response.status_code == 400
    assert "статус" in response.json()["detail"].lower()


async def test_other_passenger_cannot_confirm_pickup(client, db_session):
    """A different passenger cannot confirm another passenger's ride."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    # Driver edits pickup
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "Changed", "fromLat": 54.691, "fromLng": 25.271},
    )

    # Create another passenger
    other_passenger = User(
        user_id="other-passenger-xyz",
        username="other_pass",
        role=UserRole.PASSENGER,
        points_balance=50,
    )
    db_session.add(other_passenger)
    await db_session.commit()

    other_headers = _headers_for(other_passenger.user_id, other_passenger.role)
    response = await client.post(
        f"/api/ride-requests/{ctx['request_id']}/confirm-pickup",
        headers=other_headers,
    )
    assert response.status_code == 404


async def test_cabinet_shows_pickup_confirmation_fields(client, db_session):
    """Cabinet endpoint includes pickupChangedByDriver and pickupConfirmedAt."""
    ctx = await _setup_driver_and_passenger(client, db_session)

    cabinet = await client.get("/api/driver/cabinet")
    assert cabinet.status_code == 200
    rides = cabinet.json()["rides"]
    ride = next(r for r in rides if r["id"] == ctx["request_id"])
    assert ride["pickupChangedByDriver"] is False
    assert ride["pickupConfirmedAt"] is None

    # Driver edits pickup
    await client.patch(
        f"/api/driver/cabinet/rides/{ctx['request_id']}/pickup",
        json={"fromAddress": "New spot", "fromLat": 54.691, "fromLng": 25.271},
    )

    cabinet2 = await client.get("/api/driver/cabinet")
    ride2 = next(r for r in cabinet2.json()["rides"] if r["id"] == ctx["request_id"])
    assert ride2["pickupChangedByDriver"] is True
    assert ride2["pickupConfirmedAt"] is None
