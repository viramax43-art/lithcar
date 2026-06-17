from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.core.security import create_access_token
from app.models.driver import Driver
from app.models.driver_ride_offer import DriverRideOffer, DriverRideOfferStatus
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User, UserRole
from app.services.geo_service import haversine_km
from tests.ride_datetime import future_ride_datetime, future_ride_datetime_iso

from app.services.offer_matching_service import (
    RouteMatchInput,
    passes_hard_filters,
    score_route_pair,
)


async def _create_zone(client):
    login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert login.status_code == 200
    response = await client.post(
        "/api/service-zones",
        json={
            "name": "Vilnius offers",
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


async def _create_driver(client, db_session, *, seats_count: int = 4, username: str | None = None):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200
    created = await client.post(
        "/api/drivers",
        json={
            "name": "Offer Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "OF001",
            "vehicleColor": "White",
            "seatsCount": seats_count,
            "licenseNumber": "LIC-OF",
            "about": "",
            "rating": 5.0,
            "isOnline": True,
            "canSelfAssign": True,
        },
    )
    assert created.status_code == 200
    payload = created.json()
    driver_id = payload["driver"]["id"]
    if username:
        user = User(
            user_id=f"driver-user-{driver_id}",
            username=username,
            role=UserRole.DRIVER,
            points_balance=0,
        )
        db_session.add(user)
        driver = await db_session.get(Driver, driver_id)
        driver.user_id = user.user_id
        await db_session.commit()
    return driver_id, payload["key"]


async def _create_passenger(db_session, *, user_id: str = "passenger-offers", points: int = 100, username: str = "offers_passenger"):
    passenger = User(
        user_id=user_id,
        username=username,
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
    driver_id, driver_key = await _create_driver(client, db_session)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post("/api/driver/offers", json=_offer_payload(**payload_overrides))
    assert created.status_code == 201
    return created.json(), driver_key, driver_id


def test_score_identical_routes_high():
    dt = datetime(2026, 6, 20, 10, 0, tzinfo=timezone.utc)
    left = RouteMatchInput(from_lat=54.69, from_lng=25.27, to_lat=54.70, to_lng=25.28, date_time=dt)
    right = RouteMatchInput(from_lat=54.69, from_lng=25.27, to_lat=54.70, to_lng=25.28, date_time=dt)
    result = score_route_pair(left, right)
    assert result.score >= 95


def test_score_far_routes_low():
    dt = datetime(2026, 6, 20, 10, 0, tzinfo=timezone.utc)
    left = RouteMatchInput(from_lat=54.69, from_lng=25.27, to_lat=54.70, to_lng=25.28, date_time=dt)
    right = RouteMatchInput(from_lat=55.10, from_lng=26.00, to_lat=55.20, to_lng=26.10, date_time=dt)
    result = score_route_pair(left, right)
    assert result.score < 60


def test_score_time_window():
    base = datetime(2026, 6, 20, 10, 0, tzinfo=timezone.utc)
    left = RouteMatchInput(from_lat=54.69, from_lng=25.27, to_lat=54.70, to_lng=25.28, date_time=base)
    close = RouteMatchInput(
        from_lat=54.69,
        from_lng=25.27,
        to_lat=54.70,
        to_lng=25.28,
        date_time=base + timedelta(minutes=15),
    )
    far = RouteMatchInput(
        from_lat=54.69,
        from_lng=25.27,
        to_lat=54.70,
        to_lng=25.28,
        date_time=base + timedelta(hours=3),
    )
    close_score = score_route_pair(left, close).score
    far_score = score_route_pair(left, far).score
    assert close_score > far_score


def test_haversine_radius_filter_helper():
    center_lat, center_lng = 54.69, 25.27
    near_lat, near_lng = 54.691, 25.271
    far_lat, far_lng = 54.80, 25.40
    assert haversine_km(center_lat, center_lng, near_lat, near_lng) <= 2.0
    assert haversine_km(center_lat, center_lng, far_lat, far_lng) > 2.0


def test_passes_hard_filters_dropoff():
    from app.services.offer_matching_service import MatchResult

    ok = MatchResult(score=80, pickup_distance_km=0.5, dropoff_distance_km=1.0, time_delta_minutes=10, reason="")
    bad = MatchResult(score=80, pickup_distance_km=0.5, dropoff_distance_km=3.0, time_delta_minutes=10, reason="")
    assert passes_hard_filters(ok)
    assert not passes_hard_filters(bad)


@pytest.mark.asyncio
async def test_matches_api_filters_by_datetime_window(client, db_session):
    await _create_zone(client)
    passenger_dt = future_ride_datetime(hours_ahead=6)
    passenger_query = passenger_dt.astimezone(ZoneInfo("Europe/Vilnius")).strftime("%Y-%m-%dT%H:%M")
    close_offer, _, _ = await _create_offer(
        client,
        db_session,
        dateTime=future_ride_datetime_iso(hours_ahead=6),
    )
    far_time_offer, _, _ = await _create_offer(
        client,
        db_session,
        dateTime=future_ride_datetime_iso(hours_ahead=12),
    )
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)
    response = await client.get(
        "/api/ride-offers/matches",
        params={
            "fromLat": 54.69,
            "fromLng": 25.27,
            "toLat": 54.70,
            "toLng": 25.28,
            "dateTime": passenger_query,
            "limit": 10,
            "minScore": 60,
        },
        headers=headers,
    )
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["items"]}
    assert close_offer["id"] in ids
    assert far_time_offer["id"] not in ids


@pytest.mark.asyncio
async def test_matches_api_requires_datetime(client, db_session):
    await _create_zone(client)
    await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session)
    response = await client.get(
        "/api/ride-offers/matches",
        params={
            "fromLat": 54.69,
            "fromLng": 25.27,
            "toLat": 54.70,
            "toLng": 25.28,
            "limit": 10,
            "minScore": 60,
        },
        headers=_passenger_headers(passenger),
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_matches_api_sorted(client, db_session):
    await _create_zone(client)
    close_offer, _, _ = await _create_offer(
        client,
        db_session,
        fromPoint={"address": "A close", "latlng": {"lat": 54.691, "lng": 25.271}},
        toPoint={"address": "B close", "latlng": {"lat": 54.692, "lng": 25.272}},
    )
    far_offer, _, _ = await _create_offer(
        client,
        db_session,
        fromPoint={"address": "A far", "latlng": {"lat": 54.695, "lng": 25.275}},
        toPoint={"address": "B far", "latlng": {"lat": 54.696, "lng": 25.276}},
    )
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)
    response = await client.get(
        "/api/ride-offers/matches",
        params={
            "fromLat": 54.69,
            "fromLng": 25.27,
            "toLat": 54.70,
            "toLng": 25.28,
            "dateTime": future_ride_datetime_iso(hours_ahead=6),
            "limit": 10,
            "minScore": 60,
        },
        headers=headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    ids = [item["id"] for item in items]
    assert close_offer["id"] in ids
    if len(items) >= 2:
        assert items[0]["matchScore"] >= items[1]["matchScore"]
    assert far_offer["id"] in ids or close_offer["id"] in ids


@pytest.mark.asyncio
async def test_matches_api_requires_coords(client, db_session):
    passenger = await _create_passenger(db_session)
    response = await client.get(
        "/api/ride-offers/matches",
        params={"fromLat": 54.69, "fromLng": 25.27},
        headers=_passenger_headers(passenger),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_driver_offer_matches_pending_only(client, db_session):
    await _create_zone(client)
    offer, driver_key, driver_id = await _create_offer(client, db_session)
    passenger = await _create_passenger(db_session, user_id="match-passenger", username="match_passenger")
    headers = _passenger_headers(passenger)
    pending = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Match Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=4),
        },
        headers=headers,
    )
    assert pending.status_code == 201
    pending_id = pending.json()["id"]

    assigned = await client.patch(
        f"/api/ride-requests/{pending_id}/assign",
        json={"driverId": driver_id},
    )
    assert assigned.status_code == 200

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    matches = await client.get(f"/api/driver/offers/{offer['id']}/matches")
    assert matches.status_code == 200
    assert all(item["id"] != pending_id for item in matches.json()["items"])


@pytest.mark.asyncio
async def test_claim_with_offer_id_links_and_decrements(client, db_session):
    await _create_zone(client)
    offer, driver_key, driver_id = await _create_offer(client, db_session, totalSeats=2)
    passenger = await _create_passenger(db_session, user_id="claim-passenger", username="claim_passenger")
    headers = _passenger_headers(passenger)
    created = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Claim Passenger",
            "fromPoint": {"address": "Start A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "End B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": future_ride_datetime_iso(hours_ahead=5),
        },
        headers=headers,
    )
    assert created.status_code == 201
    request_id = created.json()["id"]

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    claim = await client.post(
        f"/api/driver/cabinet/rides/{request_id}/claim",
        json={"offerId": offer["id"]},
    )
    assert claim.status_code == 200

    row = await db_session.get(RideRequest, request_id)
    assert row is not None
    assert row.offer_id == offer["id"]
    assert row.status == RideRequestStatus.ASSIGNED

    offer_row = await db_session.get(DriverRideOffer, offer["id"])
    assert offer_row is not None
    assert offer_row.seats_available == 1


@pytest.mark.asyncio
async def test_offer_driver_includes_telegram_username(client, db_session):
    await _create_zone(client)
    driver_id, driver_key = await _create_driver(client, db_session, username="testdriver")
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post("/api/driver/offers", json=_offer_payload())
    assert created.status_code == 201

    passenger = await _create_passenger(db_session, user_id="tg-passenger")
    listed = await client.get("/api/ride-offers", headers=_passenger_headers(passenger))
    assert listed.status_code == 200
    item = next(row for row in listed.json()["items"] if row["id"] == created.json()["id"])
    assert item["driver"]["telegramUsername"] == "testdriver"


@pytest.mark.asyncio
async def test_list_offers_filtered_by_2km_radius(client, db_session):
    await _create_zone(client)
    close_offer, _, _ = await _create_offer(
        client,
        db_session,
        fromPoint={"address": "Near A", "latlng": {"lat": 54.691, "lng": 25.271}},
        toPoint={"address": "Near B", "latlng": {"lat": 54.692, "lng": 25.272}},
    )
    far_offer, _, _ = await _create_offer(
        client,
        db_session,
        fromPoint={"address": "Far A", "latlng": {"lat": 54.655, "lng": 25.225}},
        toPoint={"address": "Far B", "latlng": {"lat": 54.656, "lng": 25.226}},
    )
    passenger = await _create_passenger(db_session, user_id="geo-passenger")
    headers = _passenger_headers(passenger)

    filtered = await client.get(
        "/api/ride-offers",
        params={"fromLat": 54.69, "fromLng": 25.27, "radiusKm": 2},
        headers=headers,
    )
    assert filtered.status_code == 200
    ids = {item["id"] for item in filtered.json()["items"]}
    assert close_offer["id"] in ids
    assert far_offer["id"] not in ids

    all_offers = await client.get("/api/ride-offers", headers=headers)
    assert all_offers.status_code == 200
    all_ids = {item["id"] for item in all_offers.json()["items"]}
    assert close_offer["id"] in all_ids
    assert far_offer["id"] in all_ids
