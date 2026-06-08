from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.core.security import create_access_token
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso


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
            "name": "Vilnius route zone",
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


async def _setup_assigned_ride(client, db_session):
    await _create_zone(client)

    driver_user = User(user_id="9001", username="driver_route", role=UserRole.DRIVER, points_balance=0)
    db_session.add(driver_user)
    await db_session.commit()

    created_driver = await client.post(
        "/api/drivers",
        json={
            "userId": "9001",
            "name": "Route Driver",
            "carBrand": "VW",
            "carModel": "Golf",
            "carPlate": "RTE001",
            "vehicleColor": "Blue",
            "seatsCount": 4,
            "licenseNumber": "LIC-RTE",
            "about": "",
            "rating": 4.8,
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_payload = created_driver.json()
    driver_id = driver_payload["driver"]["id"]
    driver_key = driver_payload["key"]

    passenger = User(
        user_id="9002",
        username="passenger_route",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()

    passenger_headers = _headers_for(passenger.user_id, passenger.role)
    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Route Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
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

    return {
        "driver_id": driver_id,
        "passenger_headers": passenger_headers,
        "request_id": request_id,
    }


async def test_passenger_can_edit_route_on_assigned_ride(client, db_session):
    ctx = await _setup_assigned_ride(client, db_session)

    with patch(
        "app.services.ride_route_notification_service.notify_route_changed",
        new_callable=AsyncMock,
    ) as notify_mock:
        response = await client.patch(
            f"/api/ride-requests/{ctx['request_id']}",
            json={
                "fromPoint": {
                    "address": "Passenger new A",
                    "latlng": {"lat": 54.691, "lng": 25.271},
                },
            },
            headers=ctx["passenger_headers"],
        )
        assert response.status_code == 200
        body = response.json()
        assert body["fromPoint"]["address"] == "Passenger new A"
        notify_mock.assert_awaited_once()


async def test_admin_route_update_notifies_both(client, db_session):
    ctx = await _setup_assigned_ride(client, db_session)

    with patch(
        "app.services.ride_route_notification_service.notify_route_changed",
        new_callable=AsyncMock,
    ) as notify_mock:
        response = await client.patch(
            f"/api/ride-requests/{ctx['request_id']}/route",
            json={
                "toPoint": {
                    "address": "Admin new B",
                    "latlng": {"lat": 54.701, "lng": 25.281},
                },
            },
        )
        assert response.status_code == 200
        assert response.json()["toPoint"]["address"] == "Admin new B"
        notify_mock.assert_awaited_once()


async def test_driver_route_update_auto_notifies_passenger(client, db_session):
    ctx = await _setup_assigned_ride(client, db_session)

    with patch(
        "app.services.ride_route_notification_service.notify_route_changed",
        new_callable=AsyncMock,
    ) as notify_mock:
        response = await client.patch(
            f"/api/driver/cabinet/rides/{ctx['request_id']}/route",
            json={
                "fromPoint": {
                    "address": "Driver new A",
                    "lat": 54.692,
                    "lng": 25.272,
                },
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["fromAddress"] == "Driver new A"
        assert body["pickupChangedByDriver"] is True
        assert body["pickupNotifiedAt"] is not None
        notify_mock.assert_awaited_once()


async def test_completed_ride_route_update_blocked(client, db_session):
    ctx = await _setup_assigned_ride(client, db_session)

    status = await client.patch(
        f"/api/ride-requests/{ctx['request_id']}/status",
        json={"status": "completed"},
    )
    assert status.status_code == 200

    response = await client.patch(
        f"/api/ride-requests/{ctx['request_id']}/route",
        json={
            "fromPoint": {
                "address": "Too late",
                "latlng": {"lat": 54.691, "lng": 25.271},
            },
        },
    )
    assert response.status_code == 400


async def test_route_update_noop_skips_notifications(client, db_session):
    ctx = await _setup_assigned_ride(client, db_session)

    with patch(
        "app.services.ride_route_notification_service.notify_route_changed",
        new_callable=AsyncMock,
    ) as notify_mock:
        response = await client.patch(
            f"/api/ride-requests/{ctx['request_id']}/route",
            json={
                "fromPoint": {
                    "address": "Start A",
                    "latlng": {"lat": 54.69, "lng": 25.27},
                },
            },
        )
        assert response.status_code == 200
        notify_mock.assert_not_awaited()
