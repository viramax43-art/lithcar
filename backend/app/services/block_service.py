from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_block import UserBlock


class BlockError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class BlockedUserRow:
    user_id: str
    username: str | None
    display_name: str
    blocked_at: datetime


async def block_user(
    db_session: AsyncSession,
    *,
    blocker_id: str,
    blocked_id: str,
) -> UserBlock:
    if blocker_id == blocked_id:
        raise BlockError("self_block", "You cannot block yourself.")

    blocker = await db_session.get(User, blocker_id)
    if blocker is None:
        raise BlockError("user_not_found", "User not found.")
    blocked = await db_session.get(User, blocked_id)
    if blocked is None:
        raise BlockError("user_not_found", "User not found.")

    block = UserBlock(blocker_user_id=blocker_id, blocked_user_id=blocked_id)
    db_session.add(block)
    try:
        await db_session.commit()
    except IntegrityError:
        await db_session.rollback()
        existing = await db_session.execute(
            select(UserBlock).where(
                UserBlock.blocker_user_id == blocker_id,
                UserBlock.blocked_user_id == blocked_id,
            )
        )
        found = existing.scalar_one_or_none()
        if found is None:
            raise
        return found

    await db_session.refresh(block)
    return block


async def unblock_user(
    db_session: AsyncSession,
    *,
    blocker_id: str,
    blocked_id: str,
) -> None:
    result = await db_session.execute(
        delete(UserBlock).where(
            UserBlock.blocker_user_id == blocker_id,
            UserBlock.blocked_user_id == blocked_id,
        )
    )
    if int(result.rowcount or 0) == 0:
        raise BlockError("not_blocked", "User is not blocked.")
    await db_session.commit()


async def list_blocked_users(
    db_session: AsyncSession,
    *,
    blocker_id: str,
) -> list[BlockedUserRow]:
    result = await db_session.execute(
        select(UserBlock, User)
        .join(User, User.user_id == UserBlock.blocked_user_id)
        .where(UserBlock.blocker_user_id == blocker_id)
        .order_by(UserBlock.created_at.desc())
    )
    rows: list[BlockedUserRow] = []
    for block, user in result.all():
        display_name = user.username or user.user_id
        rows.append(
            BlockedUserRow(
                user_id=user.user_id,
                username=user.username,
                display_name=display_name,
                blocked_at=block.created_at,
            )
        )
    return rows


async def is_blocked(
    db_session: AsyncSession,
    *,
    blocker_id: str,
    blocked_id: str,
) -> bool:
    result = await db_session.execute(
        select(UserBlock.id).where(
            UserBlock.blocker_user_id == blocker_id,
            UserBlock.blocked_user_id == blocked_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def are_users_blocked(
    db_session: AsyncSession,
    *,
    user_a: str,
    user_b: str,
) -> bool:
    if await is_blocked(db_session, blocker_id=user_a, blocked_id=user_b):
        return True
    return await is_blocked(db_session, blocker_id=user_b, blocked_id=user_a)


async def get_blocked_user_ids_for_viewer(
    db_session: AsyncSession,
    *,
    viewer_id: str,
) -> set[str]:
    result = await db_session.execute(
        select(UserBlock.blocker_user_id, UserBlock.blocked_user_id).where(
            or_(
                UserBlock.blocker_user_id == viewer_id,
                UserBlock.blocked_user_id == viewer_id,
            )
        )
    )
    blocked_ids: set[str] = set()
    for blocker_id, blocked_user_id in result.all():
        if blocker_id == viewer_id:
            blocked_ids.add(blocked_user_id)
        if blocked_user_id == viewer_id:
            blocked_ids.add(blocker_id)
    return blocked_ids
