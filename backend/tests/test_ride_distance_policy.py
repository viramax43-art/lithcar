from __future__ import annotations

import pytest

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.services.platform_settings_service import min_ride_distance_km
from app.services.ride_distance_policy import (
    RideDistanceTooShortError,
    ensure_ride_distance_allowed,
)
from tests.ride_datetime import future_ride_datetime_iso

_SHORT_ROUTE = {
    "fromPoint": {"address": "Point A", "latlng": {"lat": 54.69, "lng": 25.27}},
    "toPoint": {"address": "Point B", "latlng": {"lat": 54.70, "lng": 25.28}},
}
_LONG_ROUTE = {
    "fromPoint": {"address": "Point A", "latlng": {"lat": 54.69, "lng": 25.27}},
    "toPoint": {"address": "Point B", "latlng": {"lat": 54.75, "lng": 25.27}},
}


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
            "name": "Vilnius distance zone",
            "color": "#3B82F6",
            "polygon": [
                {"lat": 54.72, "lng": 25.22},
                {"lat": 54.72, "lng": 25.34},
                {"lat": 54.60, "lng": 25.34},
                {"lat": 54.60, "lng": 25.22},
            ],
            "isActive": True,
        },
    )
    assert response.status_code == 200


async def _set_min_distance(client, value: float) -> None:
    await _admin_login(client)
    response = await client.patch(
        "/api/admin/platform-settings",
        json={"system": {"minRideDistanceKm": value}},
    )
    assert response.status_code == 200
    assert response.json()["system"]["minRideDistanceKm"] == value


async def _create_passenger(db_session) -> User:
    passenger = User(
        user_id="distance-passenger",
        username="distance_passenger",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    db_session.add(passenger)
    await db_session.commit()
    return passenger


def _passenger_headers(passenger: User) -> dict[str, str]:
    token = create_access_token(subject=passenger.user_id, role=passenger.role)
    return {"Authorization": f"Bearer {token}"}


async def _create_driver(client) -> str:
    await _admin_login(client)
    created = await client.post(
        "/api/drivers",
        json={
            "name": "Distance Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "DST001",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-DST",
            "about": "",
            "rating": 5.0,
            "isOnline": True,
        },
    )
    assert created.status_code == 200
    return created.json()["key"]


async def test_default_min_distance_is_three_km_and_can_be_disabled():
    assert min_ride_distance_km() == 3.0
    assert min_ride_distance_km({"system": {"minRideDistanceKm": 0}}) == 0.0
    assert min_ride_distance_km({"system": {"minRideDistanceKm": "broken"}}) == 3.0


async def test_ensure_ride_distance_allowed_threshold():
    with pytest.raises(RideDistanceTooShortError) as exc_info:
        ensure_ride_distance_allowed(
            from_lat=54.69,
            from_lng=25.27,
            to_lat=54.70,
            to_lng=25.28,
            min_distance_km=3,
        )

    detail = exc_info.value.as_http_detail()
    assert detail["code"] == "ride_distance_too_short"
    assert detail["distanceKm"] < 3
    assert detail["minDistanceKm"] == 3

    distance = ensure_ride_distance_allowed(
        from_lat=54.69,
        from_lng=25.27,
        to_lat=54.75,
        to_lng=25.27,
        min_distance_km=3,
    )
    assert distance > 3


async def test_passenger_cannot_create_request_with_short_point_b(client, db_session):
    await _create_zone(client)
    await _set_min_distance(client, 3)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)

    short = await client.post(
        "/api/v1/ride-requests",
        json={
            "passengerName": "Distance Passenger",
            **_SHORT_ROUTE,
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
        },
        headers=headers,
    )
    assert short.status_code == 400
    detail = short.json()["detail"]
    assert detail["code"] == "ride_distance_too_short"
    assert detail["minDistanceKm"] == 3

    long = await client.post(
        "/api/v1/ride-requests",
        json={
            "passengerName": "Distance Passenger",
            **_LONG_ROUTE,
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
        },
        headers=headers,
    )
    assert long.status_code == 201

    pricing = await client.get("/api/v1/pricing", headers=headers)
    assert pricing.status_code == 200
    assert pricing.json()["minRideDistanceKm"] == 3


async def test_passenger_cannot_move_point_b_closer_than_setting(client, db_session):
    await _create_zone(client)
    await _set_min_distance(client, 3)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)

    created = await client.post(
        "/api/v1/ride-requests",
        json={
            "passengerName": "Distance Passenger",
            **_LONG_ROUTE,
            "dateTime": future_ride_datetime_iso(hours_ahead=2),
        },
        headers=headers,
    )
    assert created.status_code == 201

    updated = await client.patch(
        f"/api/ride-requests/{created.json()['id']}",
        json={"toPoint": _SHORT_ROUTE["toPoint"]},
        headers=headers,
    )
    assert updated.status_code == 400
    assert updated.json()["detail"]["code"] == "ride_distance_too_short"


async def test_driver_offer_rejects_short_point_b(client, db_session):
    await _create_zone(client)
    await _set_min_distance(client, 3)
    driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200

    short = await client.post(
        "/api/v1/driver/offers",
        json={
            **_SHORT_ROUTE,
            "dateTime": future_ride_datetime_iso(hours_ahead=6),
            "totalSeats": 2,
        },
    )
    assert short.status_code == 400
    assert short.json()["detail"]["code"] == "ride_distance_too_short"

    long = await client.post(
        "/api/v1/driver/offers",
        json={
            **_LONG_ROUTE,
            "dateTime": future_ride_datetime_iso(hours_ahead=6),
            "totalSeats": 2,
        },
    )
    assert long.status_code == 201
