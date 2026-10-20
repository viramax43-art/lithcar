from __future__ import annotations

from tests.ride_datetime import future_ride_datetime_iso

from app.core.security import create_access_token
from app.models.user import User, UserRole


async def _admin_login(client) -> None:
    response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert response.status_code == 200, response.text


async def _create_zone(client) -> None:
    await _admin_login(client)
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Vilnius radius",
            "color": "#3B82F6",
            "polygon": [
                {"lat": 55.00, "lng": 25.00},
                {"lat": 55.00, "lng": 25.70},
                {"lat": 54.60, "lng": 25.70},
                {"lat": 54.60, "lng": 25.00},
            ],
            "isActive": True,
        },
    )
    assert response.status_code == 200


async def _create_driver(client) -> tuple[str, str]:
    await _admin_login(client)
    created = await client.post(
        "/api/drivers",
        json={
            "name": "Radius Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "RAD001",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-RAD",
            "about": "",
            "rating": 5.0,
            "isOnline": True,
            "canSelfAssign": True,
        },
    )
    assert created.status_code == 200
    payload = created.json()
    return payload["driver"]["id"], payload["key"]


async def _create_passenger(client, db_session) -> dict[str, str]:
    passenger = User(
        user_id="passenger-radius",
        username="radius_passenger",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()
    token = create_access_token(subject=passenger.user_id, role=passenger.role)
    return {"Authorization": f"Bearer {token}"}


async def _create_ride(
    client,
    headers: dict[str, str],
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
) -> str:
    created = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Radius Passenger",
            "fromPoint": {"address": "A", "latlng": {"lat": from_lat, "lng": from_lng}},
            "toPoint": {"address": "B", "latlng": {"lat": to_lat, "lng": to_lng}},
            "dateTime": future_ride_datetime_iso(hours_ahead=3),
        },
        headers=headers,
    )
    assert created.status_code == 201
    return created.json()["id"]


def _available_ride_ids(body: dict) -> set[str]:
    return {point["rideId"] for point in body["availablePoints"]}


async def test_driver_map_filters_available_rides_by_radius(client, db_session):
    await _create_zone(client)
    _, driver_key = await _create_driver(client)
    passenger_headers = await _create_passenger(client, db_session)

    near_id = await _create_ride(
        client,
        passenger_headers,
        from_lat=54.691,
        from_lng=25.271,
        to_lat=54.70,
        to_lng=25.28,
    )
    far_id = await _create_ride(
        client,
        passenger_headers,
        from_lat=54.90,
        from_lng=25.55,
        to_lat=54.91,
        to_lng=25.56,
    )

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200, login.text
    location = await client.post("/api/driver/cabinet/location", json={"lat": 54.69, "lng": 25.27})
    assert location.status_code == 200

    # Admin default (7 km) is used when the driver sends no radius.
    default_map = await client.get("/api/driver/cabinet/map")
    assert default_map.status_code == 200
    default_body = default_map.json()
    assert default_body["defaultAvailableRadiusKm"] == 7
    assert default_body["availableRadiusKm"] == 7
    assert _available_ride_ids(default_body) == {near_id}
    assert default_body["hiddenAvailableRides"] == 1

    # Explicit override is honoured.
    narrow = await client.get("/api/driver/cabinet/map", params={"radiusKm": 1})
    assert narrow.status_code == 200
    assert narrow.json()["availableRadiusKm"] == 1
    assert _available_ride_ids(narrow.json()) == {near_id}

    wide = await client.get("/api/driver/cabinet/map", params={"radiusKm": 100})
    assert wide.status_code == 200
    assert _available_ride_ids(wide.json()) == {near_id, far_id}
    assert wide.json()["hiddenAvailableRides"] == 0

    # 0 disables the filter entirely.
    unlimited = await client.get("/api/driver/cabinet/map", params={"radiusKm": 0})
    assert unlimited.status_code == 200
    assert unlimited.json()["availableRadiusKm"] == 0
    assert _available_ride_ids(unlimited.json()) == {near_id, far_id}
    assert unlimited.json()["hiddenAvailableRides"] == 0

    # A changed admin default applies to drivers that send no radius.
    await _admin_login(client)
    patched = await client.patch(
        "/api/admin/platform-settings",
        json={"driver": {"availableRadiusKm": 1}},
    )
    assert patched.status_code == 200
    assert patched.json()["driver"]["availableRadiusKm"] == 1

    remapped = await client.get("/api/driver/cabinet/map")
    assert remapped.status_code == 200
    assert remapped.json()["defaultAvailableRadiusKm"] == 1
    assert remapped.json()["availableRadiusKm"] == 1
    assert _available_ride_ids(remapped.json()) == {near_id}
    assert remapped.json()["hiddenAvailableRides"] == 1
