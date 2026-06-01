from __future__ import annotations

from unittest.mock import patch

from app.core.security import create_access_token
from app.models.user import User, UserRole


def _headers_for(user_id: str, role: str) -> dict[str, str]:
    token = create_access_token(subject=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


async def _create_user(db_session, *, user_id: str, role: str) -> User:
    user = User(
        user_id=user_id,
        username=f"user-{user_id}",
        role=role,
        points_balance=100,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_admin_can_create_list_delete_map_mark(client):
    login_response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login_response.status_code == 200

    create_response = await client.post(
        "/api/map-marks",
        json={
            "title": "Main station",
            "color": "#3B82F6",
            "position": {"lat": 54.6872, "lng": 25.2797},
            "visibility": "admin_only",
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    mark_id = created["id"]
    assert created["title"] == "Main station"
    assert created["visibility"] == "admin_only"
    assert created["color"] == "#3B82F6"

    list_response = await client.get("/api/map-marks")
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["id"] == mark_id

    delete_response = await client.delete(f"/api/map-marks/{mark_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["success"] is True

    list_after_delete = await client.get("/api/map-marks")
    assert list_after_delete.status_code == 200
    assert list_after_delete.json()["total"] == 0


async def test_public_marks_visible_only_with_public_flag(client, db_session):
    passenger = await _create_user(db_session, user_id="mark-passenger", role=UserRole.PASSENGER)

    login_response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login_response.status_code == 200

    admin_only_response = await client.post(
        "/api/map-marks",
        json={
            "title": "Admin note",
            "position": {"lat": 54.68, "lng": 25.27},
            "visibility": "admin_only",
        },
    )
    assert admin_only_response.status_code == 200

    public_response = await client.post(
        "/api/map-marks",
        json={
            "title": "Public point",
            "position": {"lat": 54.69, "lng": 25.28},
            "visibility": "public",
        },
    )
    assert public_response.status_code == 200

    response = await client.get(
        "/api/map-marks/public",
        headers=_headers_for(passenger.user_id, passenger.role),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Public point"
    assert body["items"][0]["visibility"] == "public"


async def test_admin_can_upload_and_read_map_mark_photo(client):
    login_response = await client.post(
        "/api/admin/session/login",
        json={"key": "ride_chief_admin_test_bootstrap_key"},
    )
    assert login_response.status_code == 200

    with patch("app.api.map_marks.upload_mark_photo", return_value="marks/fake_image.jpg"):
        upload_response = await client.post(
            "/api/map-marks/photo",
            files={"file": ("mark.jpg", b"fake-image-bytes", "image/jpeg")},
        )
    assert upload_response.status_code == 200
    payload = upload_response.json()
    assert payload["photoKey"] == "marks/fake_image.jpg"
    assert payload["photoUrl"] == "/api/map-marks/photos/marks/fake_image.jpg"

    with patch("app.api.map_marks.download_mark_photo", return_value=(b"img", "image/jpeg")):
        get_response = await client.get("/api/map-marks/photos/marks/fake_image.jpg")
    assert get_response.status_code == 200
    assert get_response.content == b"img"
    assert get_response.headers["content-type"].startswith("image/jpeg")
