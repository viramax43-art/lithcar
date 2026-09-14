from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from app.core.security import (
    DRIVER_ENTER_TOKEN_TTL_SECONDS,
    decode_permanent_driver_enter_token,
)
from app.models.driver_login_token import DriverLoginToken, DriverLoginTokenPurpose


PROFILE_TOKEN_TTL_MINUTES = 15


@dataclass(frozen=True)
class DriverEnterRedemption:
    driver_id: str


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _ttl_for_purpose(purpose: str) -> timedelta:
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
    if purpose != DriverLoginTokenPurpose.PROFILE:
        raise ValueError("Only short-lived profile tokens are stored in the database.")

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


def _is_likely_jwt(raw_token: str) -> bool:
    return raw_token.count(".") == 2


async def _mark_jti_used(redis_client: redis.Redis | None, jti: str) -> None:
    if not redis_client or not jti:
        return
    key = f"revoked:{jti}"
    if await redis_client.get(key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired login link.",
        )
    await redis_client.setex(key, DRIVER_ENTER_TOKEN_TTL_SECONDS, "1")


async def redeem_driver_login_token(
    db_session: AsyncSession,
    *,
    raw_token: str,
    redis_client: redis.Redis | None = None,
) -> DriverEnterRedemption:
    if _is_likely_jwt(raw_token):
        try:
            payload = decode_permanent_driver_enter_token(raw_token)
            jti = str(payload.get("jti", "")).strip()
            await _mark_jti_used(redis_client, jti)
            return DriverEnterRedemption(driver_id=str(payload["driver_id"]))
        except (JWTError, ValueError):
            pass

    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)
    token_result = await db_session.execute(
        select(DriverLoginToken).where(DriverLoginToken.token_hash == token_hash)
    )
    token = token_result.scalar_one_or_none()
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired login link.",
        )

    if token.purpose == DriverLoginTokenPurpose.PROFILE:
        if token.used_at is not None or token.expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired login link.",
            )
        token.used_at = now
        await db_session.commit()

    return DriverEnterRedemption(driver_id=token.driver_id)
