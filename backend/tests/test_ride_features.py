from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token
from app.models.user import User, UserRole


async def _create_user(db_session, *, user_id: str, role: str, username: str = "user") -> User:
    user = User(user_id=user_id, username=username, role=role)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


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


async def test_passenger_create_list_and_get_own_requests(client, db_session):
    passenger = await _create_user(db_session, user_id="p-1", role=UserRole.PASSENGER, username="alice")
    await _create_zone(client)

    payload = {
        "passengerName": "Alice Rider",
        "passengerPhone": "+37060000001",
        "fromPoint": {"address": "Point A", "latlng": {"lat": 54.69, "lng": 25.27}},
        "toPoint": {"address": "Point B", "latlng": {"lat": 54.70, "lng": 25.28}},
        "dateTime": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
    }
    headers = _headers_for(passenger.user_id, passenger.role)

    created = await client.post("/api/ride-requests", json=payload, headers=headers)
    assert created.status_code == 201
    request_id = created.json()["id"]

    mine = await client.get("/api/ride-requests/me", headers=headers)
    assert mine.status_code == 200
    assert mine.json()["total"] == 1
    assert len(mine.json()["items"]) == 1
    assert mine.json()["items"][0]["id"] == request_id

    details = await client.get(f"/api/ride-requests/{request_id}", headers=headers)
    assert details.status_code == 200
    assert details.json()["passengerId"] == passenger.user_id


async def test_create_request_outside_zone_returns_400(client, db_session):
    passenger = await _create_user(db_session, user_id="p-2", role=UserRole.PASSENGER)
    await _create_zone(client)

    response = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Bob",
            "passengerPhone": "+37060000002",
            "fromPoint": {"address": "Out A", "latlng": {"lat": 55.2, "lng": 26.0}},
            "toPoint": {"address": "Out B", "latlng": {"lat": 55.3, "lng": 26.1}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert response.status_code == 400


async def test_admin_assign_driver_and_filter_requests(client, db_session):
    passenger = await _create_user(db_session, user_id="p-3", role=UserRole.PASSENGER)
    await _create_zone(client)

    create_driver_response = await client.post(
        "/api/drivers",
        json={
            "name": "Jonas",
            "phone": "+37060000003",
            "carBrand": "Toyota",
            "carModel": "Toyota",
            "carPlate": "ABC123",
            "vehicleColor": "Black",
            "seatsCount": 4,
            "licenseNumber": "LIC-123",
            "about": "Calm and safe driver",
            "rating": 4.9,
            "isOnline": True,
        },
    )
    assert create_driver_response.status_code == 200
    driver_id = create_driver_response.json()["driver"]["id"]

    create_request_response = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Passenger 3",
            "passengerPhone": "+37060000004",
            "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert create_request_response.status_code == 201
    request_id = create_request_response.json()["id"]

    assign_response = await client.patch(
        f"/api/ride-requests/{request_id}/assign",
        json={"driverId": driver_id},
    )
    assert assign_response.status_code == 200
    assert assign_response.json()["status"] == "assigned"

    filtered = await client.get("/api/ride-requests?status=assigned")
    assert filtered.status_code == 200
    assert any(item["id"] == request_id for item in filtered.json()["items"])


async def test_admin_can_manage_zones_pricing_and_suggestions(client, db_session):
    passenger = await _create_user(db_session, user_id="p-4", role=UserRole.PASSENGER)
    login_response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login_response.status_code == 200

    zone_response = await client.post(
        "/api/service-zones",
        json={
            "name": "Airport",
            "color": "#10B981",
            "polygon": [
                {"lat": 54.72, "lng": 25.22},
                {"lat": 54.72, "lng": 25.34},
                {"lat": 54.65, "lng": 25.34},
                {"lat": 54.65, "lng": 25.22},
            ],
            "isActive": True,
        },
    )
    assert zone_response.status_code == 200
    zone_id = zone_response.json()["id"]

    patch_zone = await client.patch(
        f"/api/service-zones/{zone_id}",
        json={"isActive": False},
    )
    assert patch_zone.status_code == 200
    assert patch_zone.json()["isActive"] is False

    pricing_update = await client.patch(
        "/api/pricing",
        json={"pointsPerRide": 12, "pointPriceCents": 80},
    )
    assert pricing_update.status_code == 200
    assert pricing_update.json()["ridePriceEur"] == 9.6

    # Две похожие заявки для подсказки группировки.
    await client.patch(f"/api/service-zones/{zone_id}", json={"isActive": True})
    passenger_headers = _headers_for(passenger.user_id, passenger.role)
    base_dt = datetime.now(timezone.utc) + timedelta(hours=6)
    await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "P1",
            "passengerPhone": "+37060000005",
            "fromPoint": {"address": "AA", "latlng": {"lat": 54.691, "lng": 25.271}},
            "toPoint": {"address": "BB", "latlng": {"lat": 54.700, "lng": 25.280}},
            "dateTime": base_dt.isoformat(),
        },
        headers=passenger_headers,
    )
    await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "P2",
            "passengerPhone": "+37060000006",
            "fromPoint": {"address": "CC", "latlng": {"lat": 54.692, "lng": 25.272}},
            "toPoint": {"address": "DD", "latlng": {"lat": 54.701, "lng": 25.281}},
            "dateTime": (base_dt + timedelta(minutes=20)).isoformat(),
        },
        headers=passenger_headers,
    )

    suggestions = await client.get("/api/group-suggestions")
    assert suggestions.status_code == 200
    assert isinstance(suggestions.json()["items"], list)
    assert len(suggestions.json()["items"]) >= 1
