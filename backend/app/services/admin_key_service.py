from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_admin_key, hash_admin_key
from app.models.admin_api_key import AdminApiKey, AdminApiRole


ALLOWED_ADMIN_ROLES = {
    AdminApiRole.CHIEF_ADMIN,
    AdminApiRole.ADMIN,
    AdminApiRole.MODERATOR,
}


def normalize_admin_role(role: str) -> str:
    normalized = str(role).strip().lower()
    if normalized not in ALLOWED_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported admin role.")
    return normalized


async def create_admin_key(
    db_session: AsyncSession,
    *,
    name: str,
    role: str,
    created_by_key_id: str | None,
) -> tuple[AdminApiKey, str]:
    normalized_role = normalize_admin_role(role)
    plaintext = generate_admin_key(normalized_role)
    entity = AdminApiKey(
        name=name.strip() or normalized_role,
        role=normalized_role,
        key_hash=hash_admin_key(plaintext),
        key_prefix=plaintext[:16],
        created_by_key_id=created_by_key_id,
    )
    db_session.add(entity)
    await db_session.commit()
    await db_session.refresh(entity)
    return entity, plaintext


async def list_admin_keys(
    db_session: AsyncSession,
    *,
    limit: int,
    offset: int,
) -> tuple[list[AdminApiKey], int]:
    total_query = await db_session.execute(select(func.count()).select_from(AdminApiKey))
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(
        select(AdminApiKey).order_by(AdminApiKey.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def get_admin_key_by_raw_key(db_session: AsyncSession, *, raw_key: str) -> AdminApiKey | None:
    hashed = hash_admin_key(raw_key)
    result = await db_session.execute(
        select(AdminApiKey).where(AdminApiKey.key_hash == hashed, AdminApiKey.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def get_admin_key_by_id(db_session: AsyncSession, *, admin_key_id: str) -> AdminApiKey | None:
    key = await db_session.get(AdminApiKey, admin_key_id)
    if key is None or not key.is_active:
        return None
    return key


async def touch_admin_key_usage(db_session: AsyncSession, *, admin_key: AdminApiKey) -> None:
    admin_key.last_used_at = datetime.now(timezone.utc)
    await db_session.commit()


async def revoke_admin_key(db_session: AsyncSession, *, key_id: str) -> AdminApiKey | None:
    key = await db_session.get(AdminApiKey, key_id)
    if key is None:
        return None
    key.is_active = False
    await db_session.commit()
    await db_session.refresh(key)
    return key


async def delete_admin_key(db_session: AsyncSession, *, key_id: str) -> bool:
    key = await db_session.get(AdminApiKey, key_id)
    if key is None:
        return False
    await db_session.execute(
        update(AdminApiKey).where(AdminApiKey.created_by_key_id == key_id).values(created_by_key_id=None)
    )
    await db_session.delete(key)
    await db_session.commit()
    return True


async def update_admin_key(
    db_session: AsyncSession,
    *,
    key_id: str,
    name: str | None = None,
    role: str | None = None,
) -> AdminApiKey | None:
    key = await db_session.get(AdminApiKey, key_id)
    if key is None:
        return None
    if name is not None:
        key.name = name.strip() or key.name
    if role is not None:
        key.role = normalize_admin_role(role)
    await db_session.commit()
    await db_session.refresh(key)
    return key


async def rotate_admin_key(db_session: AsyncSession, *, key_id: str) -> tuple[AdminApiKey, str] | None:
    key = await db_session.get(AdminApiKey, key_id)
    if key is None:
        return None
    plaintext = generate_admin_key(key.role)
    key.key_hash = hash_admin_key(plaintext)
    key.key_prefix = plaintext[:16]
    key.is_active = True
    await db_session.commit()
    await db_session.refresh(key)
    return key, plaintext


async def ensure_bootstrap_chief_admin_key(db_session: AsyncSession) -> None:
    bootstrap_key = settings.chief_admin_key.strip()
    if not bootstrap_key:
        return
    hashed = hash_admin_key(bootstrap_key)
    result = await db_session.execute(select(AdminApiKey).where(AdminApiKey.key_hash == hashed))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return
    entity = AdminApiKey(
        name="Bootstrap Chief Admin",
        role=AdminApiRole.CHIEF_ADMIN,
        key_hash=hashed,
        key_prefix=bootstrap_key[:16],
        created_by_key_id=None,
        is_active=True,
    )
    db_session.add(entity)
    await db_session.commit()
