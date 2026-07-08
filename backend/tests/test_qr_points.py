from __future__ import annotations

from app.core.security import create_access_token
from app.models.user import User, UserRole


async def _create_driver_with_qr_permission(client):
    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200
    created_driver = await client.post(
        "/api/drivers",
        json={
            "name": "QR Driver",
            "carBrand": "Toyota",
            "carModel": "Corolla",
            "carPlate": "QR188",
            "vehicleColor": "White",
            "seatsCount": 4,
            "licenseNumber": "LIC-188",
            "about": "QR enabled",
            "rating": 5.0,
            "isOnline": True,
            "canSellPoints": True,
        },
    )
    assert created_driver.status_code == 200
    payload = created_driver.json()
    return payload["driver"]["id"], payload["key"]


async def test_driver_issue_and_user_redeem_qr_points(client, db_session):
    _, driver_key = await _create_driver_with_qr_permission(client)

    passenger = User(
        user_id="qr-passenger-1",
        username="qr_user",
        role=UserRole.PASSENGER,
        points_balance=0,
    )
    db_session.add(passenger)
    await db_session.commit()
    passenger_headers = {"Authorization": f"Bearer {create_access_token(subject=passenger.user_id, role=passenger.role)}"}

    issue = await client.post("/api/points/qr/issue", json={"points": 20}, headers=passenger_headers)
    assert issue.status_code == 200
    issue_body = issue.json()
    assert issue_body["points"] == 20
    assert issue_body["eurAmount"] == 10.0
    assert "/api/points/qr/" in issue_body["qrUrl"]

    driver_login = await client.post("/api/driver/session/login", json={"key": driver_key})
    assert driver_login.status_code == 200
    assert driver_login.json()["canSellPoints"] is True

    redeem = await client.post("/api/points/qr/redeem", json={"token": issue_body["token"]})
    assert redeem.status_code == 200
    redeem_body = redeem.json()
    assert redeem_body["pointsAdded"] == 20
    assert redeem_body["passengerPointsBalance"] == 20
    assert redeem_body["eurAmount"] == 10.0
    assert redeem_body["debtStatus"] == "owed_to_driver"

    duplicate = await client.post("/api/points/qr/redeem", json={"token": issue_body["token"]})
    assert duplicate.status_code == 410


async def test_admin_qr_sales_audit_contains_issue_and_redeem_events(client, db_session):
    _, driver_key = await _create_driver_with_qr_permission(client)
    user = User(user_id="qr-passenger-2", username="qr_user_two", role=UserRole.PASSENGER, points_balance=0)
    db_session.add(user)
    await db_session.commit()
    passenger_headers = {"Authorization": f"Bearer {create_access_token(subject=user.user_id, role=user.role)}"}

    issued = await client.post("/api/points/qr/issue", json={"points": 30}, headers=passenger_headers)
    assert issued.status_code == 200

    await client.post("/api/driver/session/login", json={"key": driver_key})
    redeemed = await client.post("/api/points/qr/redeem", json={"token": issued.json()["token"]})
    assert redeemed.status_code == 200

    admin_login = await client.post("/api/admin/session/login", json={"key": "ride_chief_admin_test_bootstrap_key"})
    assert admin_login.status_code == 200
    audit = await client.get("/api/admin/qr-sales?limit=20&offset=0")
    assert audit.status_code == 200
    body = audit.json()
    assert body["total"] >= 1
    item = body["items"][0]
    assert item["pointsAmount"] == 30
    assert item["eurAmount"] == 15.0
    assert item["settlementStatus"] == "owed_to_driver"
    assert len(item["events"]) >= 2


async def test_driver_can_issue_qr_from_user_cabinet(client, db_session):
    _, driver_key = await _create_driver_with_qr_permission(client)

    driver_user = User(
        user_id="qr-driver-user-1",
        username="qr_driver_user",
        role=UserRole.DRIVER,
        points_balance=0,
    )
    db_session.add(driver_user)
    await db_session.commit()
    driver_user_headers = {"Authorization": f"Bearer {create_access_token(subject=driver_user.user_id, role=driver_user.role)}"}

    issue = await client.post("/api/points/qr/issue", json={"points": 25}, headers=driver_user_headers)
    assert issue.status_code == 200
    issue_body = issue.json()
    assert issue_body["points"] == 25

    await client.post("/api/driver/session/login", json={"key": driver_key})
    redeem = await client.post("/api/points/qr/redeem", json={"token": issue_body["token"]})
    assert redeem.status_code == 200
    assert redeem.json()["passengerPointsBalance"] == 25


async def test_new_issue_invalidates_previous_unredeemed_qr(client, db_session):
    _, driver_key = await _create_driver_with_qr_permission(client)
    user = User(user_id="qr-passenger-3", username="qr_user_three", role=UserRole.PASSENGER, points_balance=0)
    db_session.add(user)
    await db_session.commit()
    passenger_headers = {"Authorization": f"Bearer {create_access_token(subject=user.user_id, role=user.role)}"}

    first = await client.post("/api/points/qr/issue", json={"points": 40}, headers=passenger_headers)
    assert first.status_code == 200
    second = await client.post("/api/points/qr/issue", json={"points": 50}, headers=passenger_headers)
    assert second.status_code == 200

    await client.post("/api/driver/session/login", json={"key": driver_key})

    redeem_first = await client.post(
        "/api/points/qr/redeem",
        json={"token": first.json()["token"]},
    )
    assert redeem_first.status_code == 410

    redeem_second = await client.post(
        "/api/points/qr/redeem",
        json={"token": second.json()["token"]},
    )
    assert redeem_second.status_code == 200
    assert redeem_second.json()["pointsAdded"] == 50
