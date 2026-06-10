from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.info_block import (
    InfoBlock,
    InfoBlockPool,
    InfoBlockRead,
    InfoBlockReadRecipientType,
)
from app.models.notification import NotificationType


@dataclass(frozen=True)
class InfoBlockRecipient:
    pool: str
    recipient_type: str
    recipient_id: str


@dataclass(frozen=True)
class InfoBlockView:
    id: str
    pool: str
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime


def info_block_to_notification_out(view: InfoBlockView):
    from app.schemas.notification import NotificationOut

    return NotificationOut(
        id=view.id,
        pool=view.pool,
        type=NotificationType.INFO_BLOCK,
        title=view.title,
        body=view.body,
        payload=None,
        readAt=view.read_at,
        createdAt=view.created_at,
    )


def _blocks_base_query(
    *,
    pool: str,
    recipient_type: str,
    recipient_id: str,
    active_only: bool = True,
):
    stmt = (
        select(InfoBlock, InfoBlockRead.read_at)
        .outerjoin(
            InfoBlockRead,
            and_(
                InfoBlockRead.info_block_id == InfoBlock.id,
                InfoBlockRead.recipient_type == recipient_type,
                InfoBlockRead.recipient_id == recipient_id,
            ),
        )
        .where(InfoBlock.pool == pool)
    )
    if active_only:
        stmt = stmt.where(InfoBlock.is_active.is_(True))
    return stmt.order_by(InfoBlock.sort_order.asc(), InfoBlock.created_at.desc())


async def list_info_blocks_for_recipient(
    db_session: AsyncSession,
    *,
    recipient: InfoBlockRecipient,
    limit: int,
    offset: int,
    unread_only: bool = False,
) -> tuple[list[InfoBlockView], int]:
    stmt = _blocks_base_query(
        pool=recipient.pool,
        recipient_type=recipient.recipient_type,
        recipient_id=recipient.recipient_id,
        active_only=True,
    )
    if unread_only:
        stmt = stmt.where(InfoBlockRead.read_at.is_(None))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db_session.execute(count_stmt)).scalar_one() or 0)

    result = await db_session.execute(stmt.limit(limit).offset(offset))
    views = [
        InfoBlockView(
            id=block.id,
            pool=block.pool,
            title=block.title,
            body=block.body,
            read_at=read_at,
            created_at=block.created_at,
        )
        for block, read_at in result.all()
    ]
    return views, total


async def count_unread_info_blocks(
    db_session: AsyncSession,
    *,
    recipient: InfoBlockRecipient,
) -> int:
    stmt = _blocks_base_query(
        pool=recipient.pool,
        recipient_type=recipient.recipient_type,
        recipient_id=recipient.recipient_id,
        active_only=True,
    ).where(InfoBlockRead.read_at.is_(None))
    result = await db_session.execute(select(func.count()).select_from(stmt.subquery()))
    return int(result.scalar_one() or 0)


async def mark_info_block_read(
    db_session: AsyncSession,
    *,
    info_block_id: str,
    recipient: InfoBlockRecipient,
) -> InfoBlockView | None:
    block = await db_session.get(InfoBlock, info_block_id)
    if block is None or not block.is_active or block.pool != recipient.pool:
        return None

    result = await db_session.execute(
        select(InfoBlockRead).where(
            InfoBlockRead.info_block_id == info_block_id,
            InfoBlockRead.recipient_type == recipient.recipient_type,
            InfoBlockRead.recipient_id == recipient.recipient_id,
        )
    )
    read_row = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if read_row is None:
        read_row = InfoBlockRead(
            info_block_id=info_block_id,
            recipient_type=recipient.recipient_type,
            recipient_id=recipient.recipient_id,
            read_at=now,
        )
        db_session.add(read_row)
    else:
        read_row.read_at = now
    await db_session.commit()

    return InfoBlockView(
        id=block.id,
        pool=block.pool,
        title=block.title,
        body=block.body,
        read_at=now,
        created_at=block.created_at,
    )


async def mark_all_info_blocks_read(
    db_session: AsyncSession,
    *,
    recipient: InfoBlockRecipient,
) -> int:
    result = await db_session.execute(
        select(InfoBlock).where(
            InfoBlock.pool == recipient.pool,
            InfoBlock.is_active.is_(True),
        )
    )
    blocks = list(result.scalars().all())
    if not blocks:
        return 0

    block_ids = [block.id for block in blocks]
    reads_result = await db_session.execute(
        select(InfoBlockRead).where(
            InfoBlockRead.info_block_id.in_(block_ids),
            InfoBlockRead.recipient_type == recipient.recipient_type,
            InfoBlockRead.recipient_id == recipient.recipient_id,
        )
    )
    existing = {row.info_block_id: row for row in reads_result.scalars().all()}
    now = datetime.now(timezone.utc)
    updated = 0
    for block in blocks:
        read_row = existing.get(block.id)
        if read_row is None:
            db_session.add(
                InfoBlockRead(
                    info_block_id=block.id,
                    recipient_type=recipient.recipient_type,
                    recipient_id=recipient.recipient_id,
                    read_at=now,
                )
            )
            updated += 1
        elif read_row.read_at is None:
            read_row.read_at = now
            updated += 1
    await db_session.commit()
    return updated


async def list_admin_info_blocks(
    db_session: AsyncSession,
    *,
    pool: str,
) -> list[InfoBlock]:
    result = await db_session.execute(
        select(InfoBlock)
        .where(InfoBlock.pool == pool)
        .order_by(InfoBlock.sort_order.asc(), InfoBlock.created_at.desc())
    )
    return list(result.scalars().all())


async def create_info_block(
    db_session: AsyncSession,
    *,
    pool: str,
    title: str,
    body: str,
    created_by_admin_key_id: str,
) -> InfoBlock:
    if pool not in {InfoBlockPool.PASSENGER, InfoBlockPool.DRIVER}:
        raise ValueError("Invalid info block pool.")
    entity = InfoBlock(
        pool=pool,
        title=title.strip(),
        body=body.strip(),
        created_by_admin_key_id=created_by_admin_key_id,
    )
    db_session.add(entity)
    await db_session.commit()
    await db_session.refresh(entity)
    return entity


async def delete_info_block(
    db_session: AsyncSession,
    *,
    info_block_id: str,
) -> bool:
    entity = await db_session.get(InfoBlock, info_block_id)
    if entity is None:
        return False
    await db_session.delete(entity)
    await db_session.commit()
    return True


async def update_info_block(
    db_session: AsyncSession,
    *,
    info_block_id: str,
    title: str | None = None,
    body: str | None = None,
    is_active: bool | None = None,
) -> InfoBlock | None:
    entity = await db_session.get(InfoBlock, info_block_id)
    if entity is None:
        return None
    if title is not None:
        entity.title = title.strip()
    if body is not None:
        entity.body = body.strip()
    if is_active is not None:
        entity.is_active = is_active
    await db_session.commit()
    await db_session.refresh(entity)
    return entity
