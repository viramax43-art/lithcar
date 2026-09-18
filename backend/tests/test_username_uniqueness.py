"""Tests for Telegram username uniqueness enforcement."""
from __future__ import annotations

import pytest

from app.models.user import User, UserRole
from app.services.user_service import UsernameConflictError, get_or_create_user


@pytest.mark.asyncio
async def test_username_conflict_on_create(db_session):
    existing = User(user_id="111", username="SameUser", role=UserRole.PASSENGER)
    db_session.add(existing)
    await db_session.commit()

    with pytest.raises(UsernameConflictError):
        await get_or_create_user(
            db_session,
            user_id="222",
            username="sameuser",
        )


@pytest.mark.asyncio
async def test_username_conflict_on_update(db_session):
    owner = User(user_id="111", username="Owner", role=UserRole.PASSENGER)
    other = User(user_id="222", username="Other", role=UserRole.PASSENGER)
    db_session.add_all([owner, other])
    await db_session.commit()

    with pytest.raises(UsernameConflictError):
        await get_or_create_user(
            db_session,
            user_id="222",
            username="owner",
        )


@pytest.mark.asyncio
async def test_same_user_can_refresh_own_username(db_session):
    user = User(user_id="111", username="MyName", role=UserRole.PASSENGER)
    db_session.add(user)
    await db_session.commit()

    updated = await get_or_create_user(
        db_session,
        user_id="111",
        username="myname",
    )
    assert updated.user_id == "111"
    assert updated.username == "myname"
