from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, Request, Response, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user_optional
from app.api.telegram_identity import TelegramIdentity, resolve_telegram_identity
from app.core.auth_cookies import clear_admin_session_cookie
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.security import admin_session_token_telegram_user_id, decode_admin_session_token
from app.models.admin_api_key import AdminApiKey
from app.models.user import User
from app.services.admin_key_service import admin_key_matches_telegram_identity, get_admin_key_by_id


@dataclass
class AdminSession:
    admin_key_id: str
    role: str
    name: str


async def get_admin_session_optional(
    request: Request,
    response: Response,
    db_session: AsyncSession = Depends(get_db_session),
) -> AdminSession | None:
    token = request.cookies.get(settings.admin_session_cookie_name)
    if not token:
        return None
    try:
        payload = decode_admin_session_token(token)
    except (JWTError, ValueError):
        return None

    admin_key_id = str(payload.get("admin_key_id", ""))
    key = await get_admin_key_by_id(db_session, admin_key_id=admin_key_id)
    if key is None:
        return None

    identity = resolve_telegram_identity(request)
    if identity is not None and not _session_matches_identity(key=key, payload=payload, identity=identity):
        # The cookie belongs to another Telegram account of this device: drop it so
        # the panel asks for a sign-in of the account that is actually in use.
        clear_admin_session_cookie(response)
        return None
    return AdminSession(admin_key_id=key.id, role=key.role, name=key.name)


def _session_matches_identity(
    *,
    key: AdminApiKey,
    payload: dict,
    identity: TelegramIdentity,
) -> bool:
    if not admin_key_matches_telegram_identity(
        key,
        telegram_user_id=identity.user_id,
        telegram_username=identity.username,
    ):
        return False
    bound_telegram_user_id = admin_session_token_telegram_user_id(payload)
    return bound_telegram_user_id is None or bound_telegram_user_id == identity.user_id


async def get_admin_session(
    session: AdminSession | None = Depends(get_admin_session_optional),
) -> AdminSession:
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin session required.")
    return session


def require_admin_roles(*allowed_roles: str) -> Callable[[AdminSession], AdminSession]:
    normalized_allowed = {role.strip().lower() for role in allowed_roles}

    async def dependency(session: AdminSession = Depends(get_admin_session)) -> AdminSession:
        if session.role.strip().lower() not in normalized_allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role is not allowed.")
        return session

    return dependency


async def require_user_or_admin_session(
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    admin_session: AdminSession | None = Depends(get_admin_session_optional),
    db_session: AsyncSession = Depends(get_db_session),
) -> tuple[User | None, AdminSession | None]:
    if current_user is not None or admin_session is not None:
        return current_user, admin_session
    # Driver mini-app uses a separate session cookie for map/offer flows.
    from app.api.driver_portal import get_driver_session_optional

    driver_session = await get_driver_session_optional(request, db_session)
    if driver_session is not None:
        return current_user, admin_session
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
