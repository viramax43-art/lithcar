from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import AdminSession, get_admin_session, get_admin_session_optional, require_admin_roles
from app.api.auth import get_current_user_optional
from app.api.telegram_identity import TelegramIdentity, resolve_telegram_identity
from app.core.auth_cookies import clear_admin_session_cookie, session_cookie_samesite, session_cookie_secure
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.limiter import limiter
from app.core.security import create_admin_session_token, parse_tg_user_data
from app.models.admin_api_key import AdminApiKey, AdminApiRole
from app.models.user import User
from app.services.admin_key_service import (
    admin_key_matches_telegram_identity,
    bind_admin_key_telegram_identity,
    create_admin_key,
    delete_admin_key,
    get_admin_key_by_raw_key,
    get_admin_key_by_telegram_identity,
    list_admin_keys,
    rotate_admin_key,
    revoke_admin_key,
    touch_admin_key_usage,
    update_admin_key,
)


router = APIRouter(prefix="/admin")


class AdminKeyLoginPayload(BaseModel):
    key: str = Field(min_length=10)


class AdminTelegramLoginPayload(BaseModel):
    """Mini App auto-login: Telegram initData is optional when the passenger cookie is present."""

    initData: str | None = None


class AdminSessionOut(BaseModel):
    role: str
    name: str


class AdminAccessOut(BaseModel):
    isAdmin: bool
    role: str | None = None
    name: str | None = None
    telegramUsername: str | None = None


class AdminKeyCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str
    telegramUsername: str | None = Field(default=None, max_length=64)


class AdminKeyUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = None
    # Empty string unbinds the staff account from Telegram.
    telegramUsername: str | None = Field(default=None, max_length=64)


class AdminKeyOut(BaseModel):
    id: str
    name: str
    role: str
    keyPrefix: str
    isActive: bool
    createdAt: datetime
    lastUsedAt: datetime | None
    telegramUsername: str | None = None
    telegramUserId: str | None = None


class CreatedAdminKeyOut(BaseModel):
    item: AdminKeyOut
    key: str


class AdminKeyPage(BaseModel):
    items: list[AdminKeyOut]
    total: int
    limit: int
    offset: int


def _to_admin_key_out(entity) -> AdminKeyOut:
    return AdminKeyOut(
        id=entity.id,
        name=entity.name,
        role=entity.role,
        keyPrefix=entity.key_prefix,
        isActive=entity.is_active,
        createdAt=entity.created_at,
        lastUsedAt=entity.last_used_at,
        telegramUsername=entity.telegram_username,
        telegramUserId=entity.telegram_user_id,
    )


def _apply_admin_session_cookie(
    response: Response,
    *,
    admin_key,
    telegram_user_id: str | None = None,
) -> None:
    token = create_admin_session_token(
        admin_key_id=admin_key.id,
        role=admin_key.role,
        telegram_user_id=telegram_user_id or admin_key.telegram_user_id,
    )
    response.set_cookie(
        key=settings.admin_session_cookie_name,
        value=token,
        max_age=settings.admin_session_ttl_hours * 3600,
        httponly=True,
        secure=session_cookie_secure(),
        samesite=session_cookie_samesite(),
        path="/",
    )


def _ensure_not_chief_admin(entity) -> None:
    if entity.role.strip().lower() == AdminApiRole.CHIEF_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chief admin account is system-managed and cannot be deleted.",
        )


@router.post("/session/login", response_model=AdminSessionOut)
@limiter.limit("3/minute")
async def admin_login_with_key(
    request: Request,
    payload: AdminKeyLoginPayload,
    response: Response,
    db_session: AsyncSession = Depends(get_db_session),
):
    admin_key = await get_admin_key_by_raw_key(db_session, raw_key=payload.key)
    if admin_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key.")

    # A panel opened inside the Mini App binds the session to that Telegram account.
    key_identity = resolve_telegram_identity(request)
    session_telegram_user_id = None
    if key_identity is not None and admin_key_matches_telegram_identity(
        admin_key,
        telegram_user_id=key_identity.user_id,
        telegram_username=key_identity.username,
    ):
        session_telegram_user_id = admin_key.telegram_user_id or key_identity.user_id

    _apply_admin_session_cookie(
        response,
        admin_key=admin_key,
        telegram_user_id=session_telegram_user_id,
    )
    await touch_admin_key_usage(db_session, admin_key=admin_key)
    return AdminSessionOut(role=admin_key.role, name=admin_key.name)


@router.post("/session/logout")
async def admin_logout(response: Response):
    clear_admin_session_cookie(response)
    return {"success": True}


@router.get("/session/me", response_model=AdminSessionOut)
async def admin_session_me(session: AdminSession = Depends(get_admin_session)):
    return AdminSessionOut(role=session.role, name=session.name)


@router.post("/session/bootstrap", response_model=AdminSessionOut)
@limiter.limit("10/minute")
async def admin_bootstrap_session(
    request: Request,
    response: Response,
    payload: AdminTelegramLoginPayload | None = None,
    current_user: User | None = Depends(get_current_user_optional),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Passwordless staff sign-in for the Mini App.

    Identity comes from Telegram initData when provided, otherwise from the
    passenger session cookie of the same browser. The staff account must be
    linked to that Telegram account (`telegram_username` / `telegram_user_id`).
    """
    telegram_user_id: str | None = None
    telegram_username: str | None = None

    raw_init_data = (payload.initData or "").strip() if payload is not None else ""
    if raw_init_data:
        tg_user = parse_tg_user_data(raw_init_data)
        if tg_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Telegram initData.",
            )
        telegram_user_id = str(tg_user.get("id") or "").strip() or None
        username = tg_user.get("username")
        telegram_username = str(username) if username else None
    elif current_user is not None:
        telegram_user_id = current_user.user_id
        telegram_username = current_user.username
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram identity is required.",
        )

    admin_key = await get_admin_key_by_telegram_identity(
        db_session,
        telegram_user_id=telegram_user_id,
        telegram_username=telegram_username,
    )
    if admin_key is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "admin_not_linked",
                "message": "This Telegram account is not linked to a staff account.",
            },
        )

    admin_key = await bind_admin_key_telegram_identity(
        db_session,
        admin_key=admin_key,
        telegram_user_id=telegram_user_id,
        telegram_username=telegram_username,
    )
    _apply_admin_session_cookie(
        response,
        admin_key=admin_key,
        telegram_user_id=telegram_user_id,
    )
    await touch_admin_key_usage(db_session, admin_key=admin_key)
    return AdminSessionOut(role=admin_key.role, name=admin_key.name)


@router.get("/session/access", response_model=AdminAccessOut)
async def admin_session_access(
    request: Request,
    session: AdminSession | None = Depends(get_admin_session_optional),
    current_user: User | None = Depends(get_current_user_optional),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Mini App entry point: should Profile show the "Admin panel" tile?"""
    identity = resolve_telegram_identity(request)
    if identity is None and current_user is not None:
        identity = TelegramIdentity(user_id=current_user.user_id, username=current_user.username)

    if identity is None:
        if session is not None:
            return AdminAccessOut(isAdmin=True, role=session.role, name=session.name)
        return AdminAccessOut(isAdmin=False)

    # The account that is in use right now wins over any leftover cookie.
    admin_key = await get_admin_key_by_telegram_identity(
        db_session,
        telegram_user_id=identity.user_id,
        telegram_username=identity.username,
    )
    if admin_key is None:
        return AdminAccessOut(isAdmin=False)
    return AdminAccessOut(
        isAdmin=True,
        role=admin_key.role,
        name=admin_key.name,
        telegramUsername=admin_key.telegram_username,
    )


@router.get("/keys", response_model=AdminKeyPage)
async def list_keys(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    entities, total = await list_admin_keys(db_session, limit=limit, offset=offset)
    return AdminKeyPage(
        items=[_to_admin_key_out(item) for item in entities],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/keys", response_model=CreatedAdminKeyOut)
async def create_key(
    payload: AdminKeyCreatePayload,
    session: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    normalized_role = payload.role.strip().lower()
    if normalized_role not in {AdminApiRole.ADMIN, AdminApiRole.MODERATOR}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chief admin can create only admin/moderator keys.",
        )
    if payload.telegramUsername is not None and payload.telegramUsername.strip():
        normalized_telegram_username = payload.telegramUsername.strip().lstrip("@").strip().lower()
        if not normalized_telegram_username.replace("_", "").isalnum():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Telegram username may contain only latin letters, digits and underscore.",
            )

    entity, plaintext = await create_admin_key(
        db_session,
        name=payload.name,
        role=normalized_role,
        created_by_key_id=session.admin_key_id,
        telegram_username=payload.telegramUsername,
    )
    return CreatedAdminKeyOut(item=_to_admin_key_out(entity), key=plaintext)


@router.post("/keys/{key_id}/revoke", response_model=AdminKeyOut)
async def revoke_key(
    key_id: str,
    _: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await db_session.get(AdminApiKey, key_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    _ensure_not_chief_admin(existing)
    entity = await revoke_admin_key(db_session, key_id=key_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    return _to_admin_key_out(entity)


@router.patch("/keys/{key_id}", response_model=AdminKeyOut)
async def update_key(
    key_id: str,
    payload: AdminKeyUpdatePayload,
    _: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await db_session.get(AdminApiKey, key_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    _ensure_not_chief_admin(existing)
    if payload.name is None and payload.role is None and payload.telegramUsername is None:
        return _to_admin_key_out(existing)
    if payload.role is not None and payload.role.strip().lower() not in {AdminApiRole.ADMIN, AdminApiRole.MODERATOR}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chief admin can set only admin/moderator roles.",
        )
    if payload.telegramUsername is not None and payload.telegramUsername.strip():
        normalized_telegram_username = payload.telegramUsername.strip().lstrip("@").strip().lower()
        if normalized_telegram_username and not normalized_telegram_username.replace("_", "").isalnum():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Telegram username may contain only latin letters, digits and underscore.",
            )
    updated = await update_admin_key(
        db_session,
        key_id=key_id,
        name=payload.name,
        role=payload.role,
        telegram_username=payload.telegramUsername,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    return _to_admin_key_out(updated)


@router.delete("/keys/{key_id}", response_model=AdminKeyOut)
async def delete_key(
    key_id: str,
    _: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await db_session.get(AdminApiKey, key_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    _ensure_not_chief_admin(existing)
    deleted_snapshot = _to_admin_key_out(existing)
    deleted = await delete_admin_key(db_session, key_id=key_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    return deleted_snapshot


@router.post("/keys/{key_id}/rotate", response_model=CreatedAdminKeyOut)
async def rotate_key(
    key_id: str,
    _: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await db_session.get(AdminApiKey, key_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    _ensure_not_chief_admin(existing)
    rotated = await rotate_admin_key(db_session, key_id=key_id)
    if rotated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin key not found.")
    entity, plaintext = rotated
    return CreatedAdminKeyOut(item=_to_admin_key_out(entity), key=plaintext)
