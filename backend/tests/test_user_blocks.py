from __future__ import annotations

import pytest

from app.core.security import create_access_token
from app.models.driver import Driver
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso


async def _create_zone(client):
    login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert login.status_code == 200
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Blocks test zone",
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


async def _create_driver(client, db_session, *, username: str = "block_driver"):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200
    created = await client.post(
        "/api/drivers",
        json={
            "name": "Block Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "BLK001",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-BLK",
            "about": "",
            "rating": 5.0,
            "isOnline": True,
            "canSelfAssign": True,
        },
    )
    assert created.status_code == 200
    payload = created.json()
    driver_id = payload["driver"]["id"]
    driver_key = payload["key"]
    user = User(
        user_id=f"driver-user-{driver_id}",
        username=username,
        role=UserRole.DRIVER,
        points_balance=0,
    )
    db_session.add(user)
    driver = await db_session.get(Driver, driver_id)
    assert driver is not None
    driver.user_id = user.user_id
    await db_session.commit()
    return driver_id, driver_key, user.user_id


async def _create_passenger(db_session, *, user_id: str = "block-passenger", points: int = 100):
    passenger = User(
        user_id=user_id,
        username="block_passenger",
        role=UserRole.PASSENGER,
        points_balance=points,
    )
    db_session.add(passenger)
    await db_session.commit()
    return passenger


def _passenger_headers(passenger: User) -> dict[str, str]:
    token = create_access_token(subject=passenger.user_id, role=passenger.role)
    return {"Authorization": f"Bearer {token}"}


def _offer_payload(**overrides):
    payload = {
        "fromPoint": {"address": "Point A", "latlng": {"lat": 54.69, "lng": 25.27}},
        "toPoint": {"address": "Point B", "latlng": {"lat": 54.70, "lng": 25.28}},
        "dateTime": future_ride_datetime_iso(hours_ahead=6),
        "totalSeats": 2,
    }
    payload.update(overrides)
    return payload


async def _create_offer(client, db_session, **payload_overrides):
    driver_id, driver_key, driver_user_id = await _create_driver(client, db_session)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post("/api/driver/offers", json=_offer_payload(**payload_overrides))
    assert created.status_code == 201
    return created.json(), driver_key, driver_id, driver_user_id


@pytest.mark.asyncio
async def test_block_hides_driver_offers_from_passenger(client, db_session):
    await _create_zone(client)
    offer, _, _, driver_user_id = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)

    listed_before = await client.get(
        "/api/ride-offers",
        params={"fromLat": 54.69, "fromLng": 25.27},
        headers=headers,
    )
    assert listed_before.status_code == 200
    assert any(item["id"] == offer["id"] for item in listed_before.json()["items"])

    blocked = await client.post(
        "/api/users/me/blocks",
        json={"userId": driver_user_id},
        headers=headers,
    )
    assert blocked.status_code == 200

    listed_after = await client.get(
        "/api/ride-offers",
        params={"fromLat": 54.69, "fromLng": 25.27},
        headers=headers,
    )
    assert listed_after.status_code == 200
    assert not any(item["id"] == offer["id"] for item in listed_after.json()["items"])


@pytest.mark.asyncio
async def test_block_book_returns_403(client, db_session):
    await _create_zone(client)
    offer, _, _, driver_user_id = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)

    blocked = await client.post(
        "/api/users/me/blocks",
        json={"userId": driver_user_id},
        headers=headers,
    )
    assert blocked.status_code == 200

    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=headers,
    )
    assert book.status_code == 403
    assert book.json()["detail"]["code"] == "blocked"


@pytest.mark.asyncio
async def test_block_excludes_from_matching(client, db_session):
    await _create_zone(client)
    offer, _, _, driver_user_id = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)

    blocked = await client.post(
        "/api/users/me/blocks",
        json={"userId": driver_user_id},
        headers=headers,
    )
    assert blocked.status_code == 200

    matches = await client.get(
        "/api/ride-offers/matches",
        params={
            "fromLat": 54.69,
            "fromLng": 25.27,
            "toLat": 54.70,
            "toLng": 25.28,
            "limit": 10,
            "minScore": 60,
        },
        headers=headers,
    )
    assert matches.status_code == 200
    assert not any(item["id"] == offer["id"] for item in matches.json()["items"])


@pytest.mark.asyncio
async def test_unblock_restores_visibility(client, db_session):
    await _create_zone(client)
    offer, _, _, driver_user_id = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)

    await client.post("/api/users/me/blocks", json={"userId": driver_user_id}, headers=headers)
    unblocked = await client.delete(f"/api/users/me/blocks/{driver_user_id}", headers=headers)
    assert unblocked.status_code == 200

    listed = await client.get(
        "/api/ride-offers",
        params={"fromLat": 54.69, "fromLng": 25.27},
        headers=headers,
    )
    assert listed.status_code == 200
    assert any(item["id"] == offer["id"] for item in listed.json()["items"])


@pytest.mark.asyncio
async def test_cannot_block_self(client, db_session):
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)
    response = await client.post(
        "/api/users/me/blocks",
        json={"userId": passenger.user_id},
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "self_block"


@pytest.mark.asyncio
async def test_mutual_block_symmetric(client, db_session):
    await _create_zone(client)
    offer, driver_key, _, driver_user_id = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session, user_id="sym-passenger", points=100)
    headers = _passenger_headers(passenger)

    await client.post("/api/users/me/blocks", json={"userId": driver_user_id}, headers=headers)

    pending = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Sym Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=4),
        },
        headers=headers,
    )
    assert pending.status_code == 201
    request_id = pending.json()["id"]

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    matches = await client.get(f"/api/driver/offers/{offer['id']}/matches")
    assert matches.status_code == 200
    assert not any(item["id"] == request_id for item in matches.json()["items"])


@pytest.mark.asyncio
async def test_driver_blocks_passenger_claim_403(client, db_session):
    await _create_zone(client)
    offer, driver_key, _, _ = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session, user_id="claim-block-passenger", points=100)
    headers = _passenger_headers(passenger)

    pending = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Claim Block Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=4),
        },
        headers=headers,
    )
    assert pending.status_code == 201
    request_id = pending.json()["id"]

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200

    blocked = await client.post(
        "/api/driver/cabinet/blocks",
        json={"userId": passenger.user_id},
    )
    assert blocked.status_code == 200

    claim = await client.post(
        f"/api/driver/cabinet/rides/{request_id}/claim",
        json={"offerId": offer["id"]},
    )
    assert claim.status_code == 403
    assert claim.json()["detail"]["code"] == "blocked"
