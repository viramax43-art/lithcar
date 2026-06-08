from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver_login_token import DriverLoginToken, DriverLoginTokenPurpose


APPROVAL_TOKEN_TTL_DAYS = 7
PROFILE_TOKEN_TTL_MINUTES = 15


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _ttl_for_purpose(purpose: str) -> timedelta:
    if purpose == DriverLoginTokenPurpose.APPROVAL:
        return timedelta(days=APPROVAL_TOKEN_TTL_DAYS)
    if purpose == DriverLoginTokenPurpose.PROFILE:
        return timedelta(minutes=PROFILE_TOKEN_TTL_MINUTES)
    raise ValueError(f"Unsupported driver login token purpose: {purpose}")


async def create_driver_login_token(
    db_session: AsyncSession,
    *,
    driver_id: str,
    user_id: str,
    purpose: str,
) -> str:
    raw_token = secrets.token_urlsafe(32)
    token = DriverLoginToken(
        token_hash=_hash_token(raw_token),
        driver_id=driver_id,
        user_id=user_id,
        purpose=purpose,
        expires_at=datetime.now(timezone.utc) + _ttl_for_purpose(purpose),
    )
    db_session.add(token)
    await db_session.flush()
    return raw_token


async def redeem_driver_login_token(
    db_session: AsyncSession,
    *,
    raw_token: str,
) -> DriverLoginToken:
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)
    result = await db_session.execute(
        update(DriverLoginToken)
        .where(
            DriverLoginToken.token_hash == token_hash,
            DriverLoginToken.used_at.is_(None),
            DriverLoginToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(DriverLoginToken.id)
    )
    redeemed_id = result.scalar_one_or_none()
    if redeemed_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired login link.",
        )
    token_result = await db_session.execute(
        select(DriverLoginToken).where(DriverLoginToken.id == redeemed_id)
    )
    token = token_result.scalar_one()
    await db_session.commit()
    return token
