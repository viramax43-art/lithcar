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
            "name": "Assign notify zone",
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


async def test_admin_assign_notifies_driver_and_passenger(client, db_session):
    await _create_zone(client)

    driver_user = User(user_id="9101", username="driver_assign_n", role=UserRole.DRIVER, points_balance=0)
    passenger = User(
        user_id="9102",
        username="passenger_assign_n",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add_all([driver_user, passenger])
    await db_session.commit()

    created_driver = await client.post(
        "/api/drivers",
        json={
            "userId": "9101",
            "name": "Assign Notify Driver",
            "carBrand": "VW",
            "carModel": "Golf",
            "carPlate": "ASN001",
            "vehicleColor": "Blue",
            "seatsCount": 4,
            "licenseNumber": "LIC-ASN",
            "about": "",
            "rating": 4.8,
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_id = created_driver.json()["driver"]["id"]

    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Assign Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]

    with (
        patch(
            "app.api.ride_requests.notify_passenger_driver_assigned",
            new_callable=AsyncMock,
        ) as passenger_mock,
        patch(
            "app.api.ride_requests.notify_driver_ride_assigned",
            new_callable=AsyncMock,
        ) as driver_mock,
    ):
        response = await client.patch(
            f"/api/ride-requests/{request_id}/assign",
            json={"driverId": driver_id},
        )
        assert response.status_code == 200
        passenger_mock.assert_awaited_once()
        driver_mock.assert_awaited_once()
        assert driver_mock.await_args.kwargs["request"].id == request_id
        assert driver_mock.await_args.kwargs["driver"].id == driver_id
