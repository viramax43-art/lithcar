from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.i18n_text import (
    has_user_info_text,
    normalize_user_info_text_i18n,
    resolve_user_info_text,
)
from app.models.driver import Driver
from app.models.info_block import (
    InfoBlock,
    InfoBlockAudience,
    InfoBlockPool,
    InfoBlockRead,
    InfoBlockReadRecipientType,
)
from app.models.notification import NotificationType
from app.models.user import DEFAULT_USER_LANGUAGE, User


@dataclass(frozen=True)
class InfoBlockRecipient:
    pool: str
    recipient_type: str
    recipient_id: str
    language: str | None = None


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


class InfoBlockTargetError(ValueError):
    pass


class InfoBlockContentError(ValueError):
    pass


async def resolve_recipient_language(
    db_session: AsyncSession,
    *,
    recipient: InfoBlockRecipient,
) -> str:
    if recipient.language:
        return recipient.language
    if recipient.recipient_type == InfoBlockReadRecipientType.USER:
        user = await db_session.get(User, recipient.recipient_id)
        return user.language if user else DEFAULT_USER_LANGUAGE
    driver = await db_session.get(Driver, recipient.recipient_id)
    if driver and driver.user_id:
        user = await db_session.get(User, driver.user_id)
        if user:
            return user.language
    return DEFAULT_USER_LANGUAGE


def _block_to_view(
    block: InfoBlock,
    *,
    read_at: datetime | None,
    language: str,
) -> InfoBlockView:
    return InfoBlockView(
        id=block.id,
        pool=block.pool,
        title=resolve_user_info_text(block.title_i18n, language),
        body=resolve_user_info_text(block.body_i18n, language),
        read_at=read_at,
        created_at=block.created_at,
    )


def normalize_username(raw: str) -> str:
    return raw.strip().lstrip("@").lower()


def _audience_filter(*, recipient_type: str, recipient_id: str):
    if recipient_type == InfoBlockReadRecipientType.USER:
        return or_(
            InfoBlock.audience == InfoBlockAudience.ALL,
            and_(
                InfoBlock.audience == InfoBlockAudience.USER,
                InfoBlock.target_user_id == recipient_id,
            ),
        )
    return or_(
        InfoBlock.audience == InfoBlockAudience.ALL,
        and_(
            InfoBlock.audience == InfoBlockAudience.USER,
            InfoBlock.target_driver_id == recipient_id,
        ),
    )


def _block_visible_to_recipient(block: InfoBlock, *, recipient: InfoBlockRecipient) -> bool:
    if not block.is_active or block.pool != recipient.pool:
        return False
    if block.audience == InfoBlockAudience.ALL:
        return True
    if recipient.recipient_type == InfoBlockReadRecipientType.USER:
        return block.target_user_id == recipient.recipient_id
    return block.target_driver_id == recipient.recipient_id


async def resolve_info_block_target(
    db_session: AsyncSession,
    *,
    pool: str,
    username: str,
) -> tuple[str, str | None, str]:
    normalized = normalize_username(username)
    if not normalized:
        raise InfoBlockTargetError("Username is required.")

    result = await db_session.execute(
        select(User).where(func.lower(User.username) == normalized)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise InfoBlockTargetError("User not found.")

    display_username = user.username or normalized
    if pool == InfoBlockPool.DRIVER:
        driver_result = await db_session.execute(
            select(Driver).where(Driver.user_id == user.user_id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver is None:
            raise InfoBlockTargetError("User is not a driver.")
        return user.user_id, driver.id, display_username

    return user.user_id, None, display_username


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
        .where(
            InfoBlock.pool == pool,
            _audience_filter(recipient_type=recipient_type, recipient_id=recipient_id),
        )
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

    language = await resolve_recipient_language(db_session, recipient=recipient)
    result = await db_session.execute(stmt.limit(limit).offset(offset))
    views = [
        _block_to_view(block, read_at=read_at, language=language)
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
    if block is None or not _block_visible_to_recipient(block, recipient=recipient):
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

    language = await resolve_recipient_language(db_session, recipient=recipient)
    return _block_to_view(block, read_at=now, language=language)


async def mark_all_info_blocks_read(
    db_session: AsyncSession,
    *,
    recipient: InfoBlockRecipient,
) -> int:
    result = await db_session.execute(
        select(InfoBlock).where(
            InfoBlock.pool == recipient.pool,
            InfoBlock.is_active.is_(True),
            _audience_filter(
                recipient_type=recipient.recipient_type,
                recipient_id=recipient.recipient_id,
            ),
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
    title_i18n: dict[str, str] | None,
    body_i18n: dict[str, str] | None,
    created_by_admin_key_id: str,
    audience: str = InfoBlockAudience.ALL,
    target_username: str | None = None,
) -> InfoBlock:
    if pool not in {InfoBlockPool.PASSENGER, InfoBlockPool.DRIVER}:
        raise ValueError("Invalid info block pool.")
    if audience not in {InfoBlockAudience.ALL, InfoBlockAudience.USER}:
        raise ValueError("Invalid info block audience.")

    normalized_title = normalize_user_info_text_i18n(title_i18n)
    normalized_body = normalize_user_info_text_i18n(body_i18n)
    if not has_user_info_text(normalized_title):
        raise InfoBlockContentError("Title is required.")
    if not has_user_info_text(normalized_body):
        raise InfoBlockContentError("Body is required.")

    target_user_id: str | None = None
    target_driver_id: str | None = None
    resolved_username: str | None = None
    if audience == InfoBlockAudience.USER:
        if not target_username or not target_username.strip():
            raise InfoBlockTargetError("Username is required.")
        target_user_id, target_driver_id, resolved_username = await resolve_info_block_target(
            db_session,
            pool=pool,
            username=target_username,
        )

    entity = InfoBlock(
        pool=pool,
        title_i18n=normalized_title,
        body_i18n=normalized_body,
        audience=audience,
        target_username=resolved_username,
        target_user_id=target_user_id,
        target_driver_id=target_driver_id,
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
    title_i18n: dict[str, str] | None = None,
    body_i18n: dict[str, str] | None = None,
    is_active: bool | None = None,
) -> InfoBlock | None:
    entity = await db_session.get(InfoBlock, info_block_id)
    if entity is None:
        return None
    if title_i18n is not None:
        normalized_title = normalize_user_info_text_i18n(title_i18n)
        if not has_user_info_text(normalized_title):
            raise InfoBlockContentError("Title is required.")
        entity.title_i18n = normalized_title
    if body_i18n is not None:
        normalized_body = normalize_user_info_text_i18n(body_i18n)
        if not has_user_info_text(normalized_body):
            raise InfoBlockContentError("Body is required.")
        entity.body_i18n = normalized_body
    if is_active is not None:
        entity.is_active = is_active
    await db_session.commit()
    await db_session.refresh(entity)
    return entity
