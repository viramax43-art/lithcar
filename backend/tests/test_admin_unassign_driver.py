from __future__ import annotations

from app.core.security import create_access_token
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso

BOOTSTRAP_KEY = "ride_chief_admin_test_bootstrap_key"


def _headers_for(user_id: str, role: str) -> dict[str, str]:
    token = create_access_token(subject=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


async def _login_admin(client, key: str = BOOTSTRAP_KEY) -> None:
    response = await client.post("/api/admin/session/login", json={"key": key})
    assert response.status_code == 200


async def _create_zone(client) -> None:
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Unassign driver zone",
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


async def _create_assigned_request(client, db_session) -> tuple[str, str]:
    """Создаёт заявку и назначает на неё водителя, возвращает (request_id, driver_id)."""
    await _create_zone(client)

    driver_user = User(
        user_id="9201",
        username="driver_unassign",
        role=UserRole.DRIVER,
        points_balance=0,
    )
    passenger = User(
        user_id="9202",
        username="passenger_unassign",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add_all([driver_user, passenger])
    await db_session.commit()

    created_driver = await client.post(
        "/api/drivers",
        json={
            "userId": driver_user.user_id,
            "name": "Unassign Driver",
            "carBrand": "Audi",
            "carModel": "A4",
            "carPlate": "UNA001",
            "vehicleColor": "Black",
            "seatsCount": 4,
            "licenseNumber": "LIC-UNA",
            "about": "",
            "rating": 4.9,
            "isOnline": True,
        },
    )
    assert created_driver.status_code == 200
    driver_id = created_driver.json()["driver"]["id"]

    created_request = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Unassign Passenger",
            "fromPoint": {"address": "Start U", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End U", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]

    assigned = await client.patch(
        f"/api/ride-requests/{request_id}/assign",
        json={"driverId": driver_id},
    )
    assert assigned.status_code == 200
    assert assigned.json()["driverId"] == driver_id
    assert assigned.json()["status"] == RideRequestStatus.ASSIGNED

    return request_id, driver_id


async def test_admin_can_unassign_driver(client, db_session):
    await _login_admin(client)
    request_id, _ = await _create_assigned_request(client, db_session)

    response = await client.delete(f"/api/ride-requests/{request_id}/assignment")
    assert response.status_code == 200
    body = response.json()
    assert body["driverId"] is None
    assert body["assignedDriver"] is None
    assert body["status"] == RideRequestStatus.PENDING

    stored = await db_session.get(RideRequest, request_id)
    assert stored is not None
    await db_session.refresh(stored)
    assert stored.driver_id is None
    assert stored.passenger_number is None
    assert stored.pickup_changed_by_driver is False


async def test_unassign_twice_returns_400(client, db_session):
    await _login_admin(client)
    request_id, _ = await _create_assigned_request(client, db_session)

    first = await client.delete(f"/api/ride-requests/{request_id}/assignment")
    assert first.status_code == 200

    second = await client.delete(f"/api/ride-requests/{request_id}/assignment")
    assert second.status_code == 400


async def test_unassign_unknown_request_returns_404(client):
    await _login_admin(client)

    response = await client.delete("/api/ride-requests/missing-request-id/assignment")
    assert response.status_code == 404


async def test_unassign_requires_admin_session(client, db_session):
    await _login_admin(client)
    request_id, _ = await _create_assigned_request(client, db_session)

    await client.post("/api/admin/session/logout")
    client.cookies.clear()

    response = await client.delete(f"/api/ride-requests/{request_id}/assignment")
    assert response.status_code == 401


async def test_moderator_can_unassign_driver(client, db_session):
    await _login_admin(client)
    created = await client.post(
        "/api/admin/keys",
        json={"name": "Unassign Moderator", "role": "moderator"},
    )
    assert created.status_code == 200
    moderator_key = created.json()["key"]

    request_id, _ = await _create_assigned_request(client, db_session)

    await client.post("/api/admin/session/logout")
    client.cookies.clear()
    await _login_admin(client, key=moderator_key)

    response = await client.delete(f"/api/ride-requests/{request_id}/assignment")
    assert response.status_code == 200
    assert response.json()["driverId"] is None
    assert response.json()["status"] == RideRequestStatus.PENDING
