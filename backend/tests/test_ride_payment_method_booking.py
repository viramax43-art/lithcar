from __future__ import annotations

from sqlalchemy import select

from app.core.security import create_access_token
from app.models.points_transaction import PointsTransaction
from app.models.ride_request import RideRequest
from app.models.user import User, UserRole
from tests.ride_datetime import future_ride_datetime_iso

BOOTSTRAP_KEY = "ride_chief_admin_test_bootstrap_key"

_ZONE_PAYLOAD = {
    "name": "Pay method zone",
    "color": "#3B82F6",
    "polygon": [
        {"lat": 54.72, "lng": 25.22},
        {"lat": 54.72, "lng": 25.34},
        {"lat": 54.65, "lng": 25.34},
        {"lat": 54.65, "lng": 25.22},
    ],
    "isActive": True,
}

_RIDE_POINTS = {
    "passengerName": "Pay Method Passenger",
    "fromPoint": {"address": "Start P", "latlng": {"lat": 54.69, "lng": 25.27}},
    "toPoint": {"address": "End P", "latlng": {"lat": 54.70, "lng": 25.28}},
}


def _headers_for(user_id: str, role: str) -> dict[str, str]:
    token = create_access_token(subject=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


async def _create_zone(client) -> None:
    login = await client.post("/api/admin/session/login", json={"key": BOOTSTRAP_KEY})
    assert login.status_code == 200
    response = await client.post("/api/service-zones", json=_ZONE_PAYLOAD)
    assert response.status_code == 200


async def _create_passenger(db_session, user_id: str, username: str, balance: int) -> User:
    passenger = User(
        user_id=user_id,
        username=username,
        role=UserRole.PASSENGER,
        points_balance=balance,
    )
    db_session.add(passenger)
    await db_session.commit()
    return passenger


async def _book(client, passenger: User, payment_method: str | None = None):
    payload = dict(_RIDE_POINTS)
    payload["dateTime"] = future_ride_datetime_iso(hours_ahead=2)
    if payment_method is not None:
        payload["paymentMethod"] = payment_method
    return await client.post(
        "/api/ride-requests",
        json=payload,
        headers=_headers_for(passenger.user_id, passenger.role),
    )


async def _stored_request(db_session, request_id: str) -> RideRequest:
    stored = await db_session.get(RideRequest, request_id)
    assert stored is not None
    await db_session.refresh(stored)
    return stored


async def test_driver_cash_booking_persists_method_and_writes_no_transaction(client, db_session):
    await _create_zone(client)
    passenger = await _create_passenger(db_session, "9301", "passenger_pay_cash", 0)

    response = await _book(client, passenger, "driver_cash")
    assert response.status_code == 201, response.text

    stored = await _stored_request(db_session, response.json()["id"])
    assert stored.payment_method == "driver_cash"

    await db_session.refresh(passenger)
    assert int(passenger.points_balance or 0) == 0
    transactions = (
        await db_session.execute(
            select(PointsTransaction).where(PointsTransaction.user_id == passenger.user_id)
        )
    ).scalars().all()
    assert transactions == []


async def test_driver_card_booking_is_persisted(client, db_session):
    await _create_zone(client)
    passenger = await _create_passenger(db_session, "9302", "passenger_pay_card", 0)

    response = await _book(client, passenger, "driver_card")
    assert response.status_code == 201, response.text

    stored = await _stored_request(db_session, response.json()["id"])
    assert stored.payment_method == "driver_card"


async def test_unknown_payment_method_falls_back_to_points(client, db_session):
    await _create_zone(client)
    passenger = await _create_passenger(db_session, "9303", "passenger_pay_unknown", 100)

    response = await _book(client, passenger, "bitcoin")
    assert response.status_code == 201, response.text

    stored = await _stored_request(db_session, response.json()["id"])
    assert stored.payment_method == "points"
