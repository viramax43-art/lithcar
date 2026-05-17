from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user_optional
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.security import decode_admin_session_token
from app.models.user import User
from app.services.admin_key_service import get_admin_key_by_id


@dataclass
class AdminSession:
    admin_key_id: str
    role: str
    name: str


async def get_admin_session_optional(
    request: Request,
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
    return AdminSession(admin_key_id=key.id, role=key.role, name=key.name)


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
    current_user: User | None = Depends(get_current_user_optional),
    admin_session: AdminSession | None = Depends(get_admin_session_optional),
) -> tuple[User | None, AdminSession | None]:
    if current_user is None and admin_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return current_user, admin_session
