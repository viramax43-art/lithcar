from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from app.core.security import create_access_token
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.ride_request import RideRequest
from app.models.user import User, UserRole
from app.services.geo_service import RouteMetrics
from app.services.pricing_service import get_or_create_pricing, update_pricing
from app.services.ride_quote_service import default_pricing_formula_json


async def _create_user(
    db_session,
    *,
    user_id: str,
    role: str,
    username: str = "user",
    points_balance: int = 100,
) -> User:
    user = User(
        user_id=user_id,
        username=username,
        role=role,
        points_balance=points_balance,
    )
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
        "fromPoint": {"address": "Point A", "latlng": {"lat": 54.69, "lng": 25.27}},
        "toPoint": {"address": "Point B", "latlng": {"lat": 54.70, "lng": 25.28}},
        "dateTime": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
    }
    headers = _headers_for(passenger.user_id, passenger.role)

    created = await client.post("/api/ride-requests", json=payload, headers=headers)
    assert created.status_code == 201
    request_id = created.json()["id"]
    await db_session.refresh(passenger)
    assert passenger.points_balance == 90

    mine = await client.get("/api/ride-requests/me", headers=headers)
    assert mine.status_code == 200
    assert mine.json()["total"] == 1
    assert len(mine.json()["items"]) == 1
    assert mine.json()["items"][0]["id"] == request_id

    details = await client.get(f"/api/ride-requests/{request_id}", headers=headers)
    assert details.status_code == 200
    assert details.json()["passengerId"] == passenger.user_id
    tx_result = await db_session.execute(
        select(PointsTransaction).where(PointsTransaction.reference_id == request_id)
    )
    tx = tx_result.scalar_one_or_none()
    assert tx is not None
    assert tx.transaction_type == PointsTransactionType.RIDE_BOOKING_DEBIT


async def test_create_request_with_insufficient_points_returns_400(client, db_session):
    passenger = await _create_user(
        db_session,
        user_id="p-low",
        role=UserRole.PASSENGER,
        points_balance=3,
    )
    await _create_zone(client)

    response = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Low Balance",
            "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "insufficient_points"


async def test_create_request_outside_zone_returns_400(client, db_session):
    passenger = await _create_user(db_session, user_id="p-2", role=UserRole.PASSENGER)
    await _create_zone(client)

    response = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Bob",
            "fromPoint": {"address": "Out A", "latlng": {"lat": 55.2, "lng": 26.0}},
            "toPoint": {"address": "Out B", "latlng": {"lat": 55.3, "lng": 26.1}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert response.status_code == 400
    await db_session.refresh(passenger)
    assert passenger.points_balance == 100
    tx_result = await db_session.execute(
        select(PointsTransaction).where(PointsTransaction.user_id == passenger.user_id)
    )
    assert list(tx_result.scalars().all()) == []


async def test_ride_quote_fixed_mode(client, db_session):
    passenger = await _create_user(db_session, user_id="p-quote", role=UserRole.PASSENGER)
    await _create_zone(client)
    headers = _headers_for(passenger.user_id, passenger.role)

    response = await client.get(
        "/api/ride-quote",
        params={"fromLat": 54.69, "fromLng": 25.27, "toLat": 54.70, "toLng": 25.28},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pricingMode"] == "fixed"
    assert body["points"] == 10


async def test_ride_quote_dynamic_mode_with_mock_osrm(client, db_session):
    passenger = await _create_user(db_session, user_id="p-dyn", role=UserRole.PASSENGER)
    await _create_zone(client)
    await get_or_create_pricing(db_session)
    await update_pricing(
        db_session,
        points_per_ride=None,
        point_price_cents=None,
        pricing_mode="dynamic",
        pricing_formula_json=default_pricing_formula_json(),
    )

    headers = _headers_for(passenger.user_id, passenger.role)
    with patch(
        "app.services.ride_quote_service.osrm_route_metrics",
        new_callable=AsyncMock,
        return_value=RouteMetrics(road_km=8.5, duration_min=18.0),
    ):
        response = await client.get(
            "/api/ride-quote",
            params={"fromLat": 54.69, "fromLng": 25.27, "toLat": 54.70, "toLng": 25.28},
            headers=headers,
        )
    assert response.status_code == 200
    body = response.json()
    assert body["pricingMode"] == "dynamic"
    assert body["points"] >= 1
    assert body["metrics"]["roadKm"] == 8.5


async def test_dynamic_booking_saves_quote_snapshot(client, db_session):
    passenger = await _create_user(
        db_session,
        user_id="p-dyn-book",
        role=UserRole.PASSENGER,
        points_balance=200,
    )
    await _create_zone(client)
    await update_pricing(
        db_session,
        points_per_ride=None,
        point_price_cents=None,
        pricing_mode="dynamic",
        pricing_formula_json=default_pricing_formula_json(),
    )

    headers = _headers_for(passenger.user_id, passenger.role)
    with patch(
        "app.services.ride_quote_service.osrm_route_metrics",
        new_callable=AsyncMock,
        return_value=RouteMetrics(road_km=6.0, duration_min=14.0),
    ):
        created = await client.post(
            "/api/ride-requests",
            json={
                "passengerName": "Dynamic Rider",
                "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
                "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
                "dateTime": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
            },
            headers=headers,
        )
    assert created.status_code == 201
    request_id = created.json()["id"]

    row = await db_session.get(RideRequest, request_id)
    assert row is not None
    assert row.quoted_points is not None
    assert row.quoted_points >= 1
    assert row.quote_road_km == 6.0


async def test_create_request_writes_debit_transaction(client, db_session):
    passenger = await _create_user(db_session, user_id="p-tx", role=UserRole.PASSENGER, points_balance=40)
    await _create_zone(client)

    response = await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "Tx User",
            "fromPoint": {"address": "A", "latlng": {"lat": 54.69, "lng": 25.27}},
            "toPoint": {"address": "B", "latlng": {"lat": 54.70, "lng": 25.28}},
            "dateTime": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert response.status_code == 201
    request_id = response.json()["id"]

    tx_result = await db_session.execute(
        select(PointsTransaction).where(PointsTransaction.reference_id == request_id)
    )
    tx = tx_result.scalar_one_or_none()
    assert tx is not None
    assert tx.transaction_type == PointsTransactionType.RIDE_BOOKING_DEBIT
    assert tx.amount == -10


async def test_admin_assign_driver_and_filter_requests(client, db_session):
    passenger = await _create_user(db_session, user_id="p-3", role=UserRole.PASSENGER)
    await _create_zone(client)

    create_driver_response = await client.post(
        "/api/drivers",
        json={
            "name": "Jonas",
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
    assert pricing_update.json()["pricingMode"] in ("fixed", "dynamic")
    assert "pricingFormula" in pricing_update.json()

    # Две похожие заявки для подсказки группировки.
    await client.patch(f"/api/service-zones/{zone_id}", json={"isActive": True})
    passenger_headers = _headers_for(passenger.user_id, passenger.role)
    base_dt = datetime.now(timezone.utc) + timedelta(hours=6)
    await client.post(
        "/api/ride-requests",
        json={
            "passengerName": "P1",
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
