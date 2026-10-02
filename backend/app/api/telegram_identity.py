from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from app.core.security import parse_tg_user_data

# Live initData of the Telegram account that is using the app *right now*.
# Cookies and localStorage are shared by every account of the same Telegram
# client, so a cookie-only session may belong to somebody else.
TELEGRAM_INIT_DATA_HEADER = "X-Telegram-Init-Data"


@dataclass(frozen=True)
class TelegramIdentity:
    """Telegram account resolved from the request."""

    user_id: str
    username: str | None = None


def resolve_telegram_identity(request: Request) -> TelegramIdentity | None:
    """Identity from the HMAC-signed initData header, when the header is present."""
    raw_init_data = (request.headers.get(TELEGRAM_INIT_DATA_HEADER) or "").strip()
    if not raw_init_data:
        return None
    tg_user = parse_tg_user_data(raw_init_data)
    if tg_user is None:
        return None
    user_id = str(tg_user.get("id") or "").strip()
    if not user_id:
        return None
    username = tg_user.get("username")
    return TelegramIdentity(user_id=user_id, username=str(username) if username else None)


def request_identity_conflicts(request: Request, *, user_id: str) -> bool:
    """True when the request carries the Telegram identity of another account."""
    identity = resolve_telegram_identity(request)
    if identity is None:
        return False
    return identity.user_id != str(user_id).strip()
