from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import AdminSession, get_admin_session, require_admin_roles
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.security import create_admin_session_token
from app.models.admin_api_key import AdminApiKey, AdminApiRole
from app.services.admin_key_service import (
    create_admin_key,
    delete_admin_key,
    get_admin_key_by_raw_key,
    list_admin_keys,
    rotate_admin_key,
    revoke_admin_key,
    touch_admin_key_usage,
    update_admin_key,
)


router = APIRouter(prefix="/admin")


class AdminKeyLoginPayload(BaseModel):
    key: str = Field(min_length=10)


class AdminSessionOut(BaseModel):
    role: str
    name: str


class AdminKeyCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str


class AdminKeyUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = None


class AdminKeyOut(BaseModel):
    id: str
    name: str
    role: str
    keyPrefix: str
    isActive: bool
    createdAt: datetime
    lastUsedAt: datetime | None


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
    )


def _ensure_not_chief_admin(entity) -> None:
    if entity.role.strip().lower() == AdminApiRole.CHIEF_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chief admin account is system-managed and cannot be deleted.",
        )


@router.post("/session/login", response_model=AdminSessionOut)
async def admin_login_with_key(
    payload: AdminKeyLoginPayload,
    response: Response,
    db_session: AsyncSession = Depends(get_db_session),
):
    admin_key = await get_admin_key_by_raw_key(db_session, raw_key=payload.key)
    if admin_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key.")

    token = create_admin_session_token(admin_key_id=admin_key.id, role=admin_key.role)
    response.set_cookie(
        key=settings.admin_session_cookie_name,
        value=token,
        max_age=settings.admin_session_ttl_hours * 3600,
        httponly=True,
        secure=settings.admin_session_cookie_secure,
        samesite="lax",
        path="/",
    )
    await touch_admin_key_usage(db_session, admin_key=admin_key)
    return AdminSessionOut(role=admin_key.role, name=admin_key.name)


@router.post("/session/logout")
async def admin_logout(response: Response):
    response.delete_cookie(
        key=settings.admin_session_cookie_name,
        httponly=True,
        secure=settings.admin_session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return {"success": True}


@router.get("/session/me", response_model=AdminSessionOut)
async def admin_session_me(session: AdminSession = Depends(get_admin_session)):
    return AdminSessionOut(role=session.role, name=session.name)


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

    entity, plaintext = await create_admin_key(
        db_session,
        name=payload.name,
        role=normalized_role,
        created_by_key_id=session.admin_key_id,
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
    if payload.name is None and payload.role is None:
        return _to_admin_key_out(existing)
    if payload.role is not None and payload.role.strip().lower() not in {AdminApiRole.ADMIN, AdminApiRole.MODERATOR}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chief admin can set only admin/moderator roles.",
        )
    updated = await update_admin_key(
        db_session,
        key_id=key_id,
        name=payload.name,
        role=payload.role,
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
