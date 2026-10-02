from __future__ import annotations

from types import SimpleNamespace

from starlette.requests import Request

from app.api.telegram_identity import (
    TELEGRAM_INIT_DATA_HEADER,
    request_identity_conflicts,
    resolve_telegram_identity,
)
from app.core.config import settings
from app.core.security import (
    admin_session_token_telegram_user_id,
    create_admin_session_token,
    decode_admin_session_token,
)
from app.services.admin_key_service import admin_key_matches_telegram_identity
from tests.telegram_init_data import make_signed_init_data

CHIEF_KEY = "ride_chief_admin_test_bootstrap_key"

# The bug report: one Telegram client switches between a staff account and a
# regular passenger, while cookies stay shared between both accounts.
ADMIN_ID = "1327953308"
ADMIN_USERNAME = "progerarm"
OTHER_ID = "555001"
OTHER_USERNAME = "bebrikzs"

ADMIN_INIT_DATA = make_signed_init_data(user_id=ADMIN_ID, username=ADMIN_USERNAME)
OTHER_INIT_DATA = make_signed_init_data(user_id=OTHER_ID, username=OTHER_USERNAME)


def _identity_headers(init_data: str) -> dict[str, str]:
    return {TELEGRAM_INIT_DATA_HEADER: init_data}


def _request_with_init_data(init_data: str) -> Request:
    headers = []
    if init_data:
        headers.append((TELEGRAM_INIT_DATA_HEADER.lower().encode("utf-8"), init_data.encode("utf-8")))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def _admin_key(telegram_user_id: str | None = None, telegram_username: str | None = None):
    return SimpleNamespace(telegram_user_id=telegram_user_id, telegram_username=telegram_username)


def _clears_cookie(response, cookie_name: str) -> bool:
    """True when the response tells the browser to drop `cookie_name`."""
    for raw_header in response.headers.get_list("set-cookie"):
        if raw_header.startswith(f"{cookie_name}=") and "Max-Age=0" in raw_header:
            return True
    return False


# --- Identity layer -----------------------------------------------------------


def test_identity_header_carries_the_signed_init_data_of_the_live_account():
    identity = resolve_telegram_identity(_request_with_init_data(ADMIN_INIT_DATA))

    assert identity is not None
    assert identity.user_id == ADMIN_ID
    assert identity.username == ADMIN_USERNAME


def test_identity_header_without_valid_signature_is_ignored():
    assert resolve_telegram_identity(_request_with_init_data("")) is None
    assert resolve_telegram_identity(_request_with_init_data("garbage=1")) is None

    tampered = ADMIN_INIT_DATA.replace("hash=", "hash=deadbeef", 1)
    assert resolve_telegram_identity(_request_with_init_data(tampered)) is None


def test_request_identity_conflicts_only_for_another_account():
    assert request_identity_conflicts(_request_with_init_data(ADMIN_INIT_DATA), user_id=ADMIN_ID) is False
    assert request_identity_conflicts(_request_with_init_data(OTHER_INIT_DATA), user_id=ADMIN_ID) is True
    # Requests without the header (older clients, browser preview) keep working.
    assert request_identity_conflicts(_request_with_init_data(""), user_id=ADMIN_ID) is False


def test_admin_session_token_binds_the_telegram_account():
    bound = decode_admin_session_token(
        create_admin_session_token(admin_key_id="key-1", role="admin", telegram_user_id=ADMIN_ID)
    )
    assert admin_session_token_telegram_user_id(bound) == ADMIN_ID

    # Key-only logins (and tokens issued before the guard) stay valid.
    unbound = decode_admin_session_token(create_admin_session_token(admin_key_id="key-1", role="admin"))
    assert admin_session_token_telegram_user_id(unbound) is None
    assert unbound["admin_key_id"] == "key-1"


def test_admin_key_match_prefers_immutable_telegram_user_id():
    key = _admin_key(telegram_user_id=ADMIN_ID, telegram_username=ADMIN_USERNAME)

    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=ADMIN_ID, telegram_username=ADMIN_USERNAME
    ) is True
    # A renamed or reused username cannot take over an already bound staff account.
    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=OTHER_ID, telegram_username=ADMIN_USERNAME
    ) is False
    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=OTHER_ID, telegram_username=OTHER_USERNAME
    ) is False


def test_username_binding_matches_only_until_the_telegram_id_is_known():
    key = _admin_key(telegram_username=ADMIN_USERNAME)

    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=ADMIN_ID, telegram_username="@ProgerArm"
    ) is True
    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=OTHER_ID, telegram_username=OTHER_USERNAME
    ) is False
    # Telegram accounts without a username cannot claim a username binding.
    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=ADMIN_ID, telegram_username=None
    ) is False


def test_key_only_staff_record_stays_unbound():
    key = _admin_key()

    assert admin_key_matches_telegram_identity(
        key, telegram_user_id=OTHER_ID, telegram_username=OTHER_USERNAME
    ) is True


# --- Passenger session --------------------------------------------------------


async def test_passenger_session_is_rejected_for_another_telegram_account(client):
    auth = await client.post("/api/auth", json={"initData": ADMIN_INIT_DATA})
    assert auth.status_code == 200

    own = await client.get("/api/users/me", headers=_identity_headers(ADMIN_INIT_DATA))
    assert own.status_code == 200
    assert own.json()["user_id"] == ADMIN_ID

    # A client that sends no identity header is still served (backward compatible).
    legacy = await client.get("/api/users/me")
    assert legacy.status_code == 200

    # The same cookie must not identify the previous account to a new one.
    foreign = await client.get("/api/users/me", headers=_identity_headers(OTHER_INIT_DATA))
    assert foreign.status_code == 401


async def test_refresh_does_not_burn_the_token_of_another_account(client):
    auth = await client.post("/api/auth", json={"initData": ADMIN_INIT_DATA})
    assert auth.status_code == 200
    assert client.cookies.get(settings.passenger_refresh_cookie_name)

    blocked = await client.post("/api/auth/refresh", headers=_identity_headers(OTHER_INIT_DATA))
    assert blocked.status_code == 401

    # The rotation happens only after the identity check, so the owner can still refresh.
    refreshed = await client.post("/api/auth/refresh", headers=_identity_headers(ADMIN_INIT_DATA))
    assert refreshed.status_code == 200

    me = await client.get("/api/users/me", headers=_identity_headers(ADMIN_INIT_DATA))
    assert me.status_code == 200
    assert me.json()["user_id"] == ADMIN_ID


# --- Admin panel session ------------------------------------------------------


async def _chief_session(client) -> None:
    login = await client.post("/api/admin/session/login", json={"key": CHIEF_KEY})
    assert login.status_code == 200


async def _staff_session_from_mini_app(client) -> None:
    """Chief links a staff key to the admin username; the admin signs in from the Mini App."""
    await _chief_session(client)
    created = await client.post(
        "/api/admin/keys",
        json={"name": "Armian", "role": "admin", "telegramUsername": ADMIN_USERNAME},
    )
    assert created.status_code == 200
    await client.post("/api/admin/session/logout")

    bootstrap = await client.post(
        "/api/v1/admin/session/bootstrap",
        json={"initData": ADMIN_INIT_DATA},
    )
    assert bootstrap.status_code == 200
    assert bootstrap.json()["role"] == "admin"


async def test_panel_session_of_previous_account_is_not_reused(client):
    await _staff_session_from_mini_app(client)

    me_own = await client.get("/api/v1/admin/session/me", headers=_identity_headers(ADMIN_INIT_DATA))
    assert me_own.status_code == 200

    # The device is now used by another Telegram account.
    me_foreign = await client.get("/api/v1/admin/session/me", headers=_identity_headers(OTHER_INIT_DATA))
    assert me_foreign.status_code == 401

    # Profile tile of the account in use: the staff dashboard is not offered to the other account.
    access_foreign = await client.get(
        "/api/v1/admin/session/access", headers=_identity_headers(OTHER_INIT_DATA)
    )
    assert access_foreign.status_code == 200
    assert access_foreign.json()["isAdmin"] is False
    assert _clears_cookie(access_foreign, settings.admin_session_cookie_name)

    # Having dropped the stale cookie the panel asks for a sign-in instead of reusing it.
    assert client.cookies.get(settings.admin_session_cookie_name) in (None, "")
    after = await client.get("/api/v1/admin/session/me", headers=_identity_headers(OTHER_INIT_DATA))
    assert after.status_code == 401


async def test_passenger_login_of_another_account_drops_the_panel_session(client):
    await _staff_session_from_mini_app(client)

    switched = await client.post("/api/auth", json={"initData": OTHER_INIT_DATA})
    assert switched.status_code == 200

    # No identity header on purpose: the bound cookie itself must be gone.
    me = await client.get("/api/v1/admin/session/me")
    assert me.status_code == 401


async def test_key_only_panel_session_survives_the_account_switch(client):
    await _chief_session(client)
    admin_cookie = client.cookies.get(settings.admin_session_cookie_name)
    assert admin_cookie
    assert admin_session_token_telegram_user_id(decode_admin_session_token(admin_cookie)) is None

    switched = await client.post("/api/auth", json={"initData": OTHER_INIT_DATA})
    assert switched.status_code == 200

    me = await client.get("/api/v1/admin/session/me")
    assert me.status_code == 200
    assert me.json()["role"] == "chief_admin"
