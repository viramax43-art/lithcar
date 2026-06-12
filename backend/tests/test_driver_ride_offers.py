from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.driver import Driver
from app.models.driver_ride_offer import DriverRideOffer, DriverRideOfferStatus
from app.models.points_transaction import PointsTransaction
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso


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


async def _create_driver(client, *, seats_count: int = 4):
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
    return payload["driver"]["id"], payload["key"]


async def _create_passenger(db_session, *, user_id: str = "passenger-offers", points: int = 100):
    passenger = User(
        user_id=user_id,
        username="offers_passenger",
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


async def _create_offer(client, **payload_overrides):
    driver_id, driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post("/api/driver/offers", json=_offer_payload(**payload_overrides))
    assert created.status_code == 201
    return created.json(), driver_key, driver_id


@pytest.mark.asyncio
async def test_create_offer_validates_datetime(client, db_session):
    await _create_zone(client)
    driver_id, driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200

    from datetime import datetime, timezone

    bad = await client.post(
        "/api/driver/offers",
        json=_offer_payload(dateTime=datetime.now(timezone.utc).isoformat()),
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_create_offer_validates_zones(client, db_session):
    driver_id, driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200

    created = await client.post(
        "/api/driver/offers",
        json=_offer_payload(
            fromPoint={"address": "Far", "latlng": {"lat": 10.0, "lng": 10.0}},
            toPoint={"address": "Far B", "latlng": {"lat": 10.1, "lng": 10.1}},
        ),
    )
    assert created.status_code == 400


@pytest.mark.asyncio
async def test_create_offer_sets_seats_available_eq_total(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=3)
    assert offer["seatsAvailable"] == 3
    assert offer["totalSeats"] == 3
    assert offer["status"] == "open"


@pytest.mark.asyncio
async def test_book_decrements_seats(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=2)
    passenger = await _create_passenger(db_session)
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 201

    row = await db_session.get(DriverRideOffer, offer["id"])
    assert row is not None
    assert row.seats_available == 1


@pytest.mark.asyncio
async def test_book_sets_full_when_last_seat(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=1)
    passenger = await _create_passenger(db_session)
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 201

    from app.models.driver_ride_offer import DriverRideOffer

    row = await db_session.get(DriverRideOffer, offer["id"])
    assert row is not None
    assert row.status == DriverRideOfferStatus.FULL
    assert row.seats_available == 0


@pytest.mark.asyncio
async def test_book_creates_assigned_request(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client)
    passenger = await _create_passenger(db_session)
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 201
    body = book.json()
    assert body["status"] == "assigned"
    assert body["offerId"] == offer["id"]
    assert body["driverId"] is not None


@pytest.mark.asyncio
async def test_book_debits_points(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client)
    passenger = await _create_passenger(db_session, points=100)
    before = passenger.points_balance
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 201
    await db_session.refresh(passenger)
    assert passenger.points_balance < before
    tx = await db_session.execute(
        select(PointsTransaction).where(PointsTransaction.user_id == passenger.user_id)
    )
    assert tx.scalars().first() is not None


@pytest.mark.asyncio
async def test_driver_create_list_cancel_offer(client, db_session):
    await _create_zone(client)
    _, driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200

    created = await client.post("/api/driver/offers", json=_offer_payload())
    assert created.status_code == 201

    listed = await client.get("/api/driver/offers")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    deleted = await client.delete(f"/api/driver/offers/{created.json()['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["success"] is True


@pytest.mark.asyncio
async def test_passenger_list_open_offers(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client)
    passenger = await _create_passenger(db_session)
    listed = await client.get("/api/ride-offers", headers=_passenger_headers(passenger))
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert any(item["id"] == offer["id"] for item in items)


@pytest.mark.asyncio
async def test_driver_role_can_list_and_book_offers(client, db_session):
    """Drivers use the passenger mini-app; role=driver must access ride-offers."""
    await _create_zone(client)
    offer, _, _ = await _create_offer(client)
    rider = User(
        user_id="driver-rider-role",
        username="driver_rider",
        role=UserRole.DRIVER,
        points_balance=100,
    )
    db_session.add(rider)
    await db_session.commit()
    headers = {
        "Authorization": f"Bearer {create_access_token(subject=rider.user_id, role=rider.role)}",
    }
    listed = await client.get("/api/ride-offers", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == offer["id"] for item in listed.json()["items"])

    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=headers,
    )
    assert book.status_code == 201
    assert book.json()["offerId"] == offer["id"]


@pytest.mark.asyncio
async def test_passenger_book_offer(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client)
    passenger = await _create_passenger(db_session)
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 201
    assert book.json()["offerId"] == offer["id"]


@pytest.mark.asyncio
async def test_book_when_full_returns_409(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=1)
    passenger_a = await _create_passenger(db_session, user_id="p-a")
    passenger_b = await _create_passenger(db_session, user_id="p-b", points=100)
    first = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger_a),
    )
    assert first.status_code == 201
    second = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger_b),
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_concurrent_book_last_seat(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=1)
    passenger_a = await _create_passenger(db_session, user_id="conc-a")
    passenger_b = await _create_passenger(db_session, user_id="conc-b", points=100)

    async def book_as(passenger: User):
        return await client.post(
            f"/api/ride-offers/{offer['id']}/book",
            json={},
            headers=_passenger_headers(passenger),
        )

    results = await asyncio.gather(book_as(passenger_a), book_as(passenger_b))
    statuses = sorted(r.status_code for r in results)
    assert statuses == [201, 409]


@pytest.mark.asyncio
async def test_cancel_with_in_progress_booking_fails(client, db_session):
    await _create_zone(client)
    offer, driver_key, _ = await _create_offer(client)
    passenger = await _create_passenger(db_session)
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 201
    request_id = book.json()["id"]

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200

    ride = await db_session.get(RideRequest, request_id)
    ride.status = RideRequestStatus.EN_ROUTE_TO_PICKUP
    await db_session.commit()

    cancel = await client.delete(f"/api/driver/offers/{offer['id']}")
    assert cancel.status_code == 409
    assert cancel.json()["detail"]["code"] == "active_rides_in_progress"


@pytest.mark.asyncio
async def test_cancel_open_offer_without_bookings(client, db_session):
    await _create_zone(client)
    _, driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post("/api/driver/offers", json=_offer_payload())
    assert created.status_code == 201
    cancel = await client.delete(f"/api/driver/offers/{created.json()['id']}")
    assert cancel.status_code == 200

    from app.models.driver_ride_offer import DriverRideOffer

    row = await db_session.get(DriverRideOffer, created.json()["id"])
    assert row.status == DriverRideOfferStatus.CANCELLED


@pytest.mark.asyncio
async def test_book_insufficient_points(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client)
    passenger = await _create_passenger(db_session, points=0)
    book = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 400
    assert book.json()["detail"]["code"] == "insufficient_points"


@pytest.mark.asyncio
async def test_book_duplicate_last_seat_returns_already_booked(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=1)
    passenger = await _create_passenger(db_session)
    first = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert first.status_code == 201
    second = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_booked"


@pytest.mark.asyncio
async def test_list_marks_offer_booked_by_me(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=2)
    passenger = await _create_passenger(db_session)
    headers = _passenger_headers(passenger)
    book = await client.post(f"/api/ride-offers/{offer['id']}/book", json={}, headers=headers)
    assert book.status_code == 201
    listed = await client.get("/api/ride-offers", headers=headers)
    assert listed.status_code == 200
    item = next(row for row in listed.json()["items"] if row["id"] == offer["id"])
    assert item["bookedByMe"] is True
    assert item["myRequestId"] == book.json()["id"]


@pytest.mark.asyncio
async def test_book_duplicate_same_passenger(client, db_session):
    await _create_zone(client)
    offer, _, _ = await _create_offer(client, totalSeats=3)
    passenger = await _create_passenger(db_session)
    first = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert first.status_code == 201
    second = await client.post(
        f"/api/ride-offers/{offer['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_booked"


@pytest.mark.asyncio
async def test_zone_validation_on_create(client, db_session):
    _, driver_key = await _create_driver(client)
    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post(
        "/api/driver/offers",
        json=_offer_payload(
            fromPoint={"address": "Outside", "latlng": {"lat": 1.0, "lng": 1.0}},
            toPoint={"address": "Outside B", "latlng": {"lat": 1.1, "lng": 1.1}},
        ),
    )
    assert created.status_code == 400


@pytest.mark.asyncio
async def test_driver_cannot_book_own_offer(client, db_session):
    await _create_zone(client)
    driver_id, driver_key = await _create_driver(client)
    passenger = await _create_passenger(db_session, user_id="driver-passenger")
    driver = await db_session.get(Driver, driver_id)
    driver.user_id = passenger.user_id
    await db_session.commit()

    login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert login.status_code == 200
    created = await client.post("/api/driver/offers", json=_offer_payload())
    assert created.status_code == 201

    book = await client.post(
        f"/api/ride-offers/{created.json()['id']}/book",
        json={},
        headers=_passenger_headers(passenger),
    )
    assert book.status_code == 403
