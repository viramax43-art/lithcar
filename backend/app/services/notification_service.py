from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.i18n import t
from app.models.admin_api_key import AdminApiKey, AdminApiRole
from app.models.notification import (
    Notification,
    NotificationPool,
    NotificationRecipientType,
    NotificationType,
)
from app.models.user import DEFAULT_USER_LANGUAGE, SUPPORTED_USER_LANGUAGES


@dataclass(frozen=True)
class NotificationRecipient:
    pool: str
    recipient_type: str
    recipient_id: str


def normalize_notification_language(language: str | None) -> str:
    if language in SUPPORTED_USER_LANGUAGES:
        return language
    return DEFAULT_USER_LANGUAGE


def resolve_notification_text(
    entity: Notification,
    *,
    language: str | None,
) -> tuple[str, str]:
    lang = normalize_notification_language(language)
    if entity.type == NotificationType.DRIVER_APPLICATION_NEW:
        payload = entity.payload if isinstance(entity.payload, dict) else {}
        applicant_name = str(payload.get("applicantName") or "")
        title = t("notif.admin.driver_application_new.title", lang)
        body_template = t("notif.admin.driver_application_new.body", lang)
        body = body_template.replace("{applicant_name}", applicant_name)
        return title, body
    return entity.title, entity.body


def _recipient_filter(recipient: NotificationRecipient):
    return and_(
        Notification.pool == recipient.pool,
        Notification.recipient_type == recipient.recipient_type,
        Notification.recipient_id == recipient.recipient_id,
    )


async def create_notification(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
    notification_type: str,
    title: str,
    body: str,
    payload: dict | None = None,
    created_by_admin_key_id: str | None = None,
) -> Notification:
    entity = Notification(
        pool=recipient.pool,
        recipient_type=recipient.recipient_type,
        recipient_id=recipient.recipient_id,
        type=notification_type,
        title=title,
        body=body,
        payload=payload,
        created_by_admin_key_id=created_by_admin_key_id,
        send_telegram=False,
    )
    db_session.add(entity)
    await db_session.flush()
    return entity


async def list_active_admin_keys_for_applications(
    db_session: AsyncSession,
) -> list[AdminApiKey]:
    allowed_roles = {AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN}
    result = await db_session.execute(
        select(AdminApiKey).where(
            AdminApiKey.is_active.is_(True),
            AdminApiKey.role.in_(allowed_roles),
        )
    )
    return list(result.scalars().all())


async def notify_admins_new_driver_application(
    db_session: AsyncSession,
    *,
    application_id: str,
    applicant_name: str,
) -> int:
    admin_keys = await list_active_admin_keys_for_applications(db_session)
    if not admin_keys:
        return 0

    title = t("notif.admin.driver_application_new.title", "lt")
    body_template = t("notif.admin.driver_application_new.body", "lt")
    body = body_template.replace("{applicant_name}", applicant_name)

    created = 0
    for admin_key in admin_keys:
        await create_notification(
            db_session,
            recipient=NotificationRecipient(
                pool=NotificationPool.ADMIN,
                recipient_type=NotificationRecipientType.ADMIN_KEY,
                recipient_id=admin_key.id,
            ),
            notification_type=NotificationType.DRIVER_APPLICATION_NEW,
            title=title,
            body=body,
            payload={
                "kind": "driver_application",
                "applicationId": application_id,
                "applicantName": applicant_name,
            },
        )
        created += 1

    await db_session.commit()
    return created


async def list_notifications(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
    limit: int,
    offset: int,
    unread_only: bool = False,
) -> tuple[list[Notification], int]:
    filters = [_recipient_filter(recipient)]
    if unread_only:
        filters.append(Notification.read_at.is_(None))

    where_clause = and_(*filters)
    total_query = await db_session.execute(
        select(func.count()).select_from(Notification).where(where_clause)
    )
    total = int(total_query.scalar_one() or 0)

    result = await db_session.execute(
        select(Notification)
        .where(where_clause)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), total


async def count_unread(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
) -> int:
    result = await db_session.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            _recipient_filter(recipient),
            Notification.read_at.is_(None),
        )
    )
    return int(result.scalar_one() or 0)


async def mark_read(
    db_session: AsyncSession,
    *,
    notification_id: str,
    recipient: NotificationRecipient,
) -> Notification | None:
    result = await db_session.execute(
        select(Notification).where(
            Notification.id == notification_id,
            _recipient_filter(recipient),
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        return None
    if entity.read_at is None:
        entity.read_at = datetime.now(timezone.utc)
        await db_session.commit()
        await db_session.refresh(entity)
    return entity


async def mark_all_read(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
) -> int:
    result = await db_session.execute(
        select(Notification).where(
            _recipient_filter(recipient),
            Notification.read_at.is_(None),
        )
    )
    entities = list(result.scalars().all())
    now = datetime.now(timezone.utc)
    for entity in entities:
        entity.read_at = now
    await db_session.commit()
    return len(entities)


@dataclass(frozen=True)
class FeedItem:
    """Элемент общей ленты уведомлений пользователя/водителя.

    Лента объединяет два источника: личные уведомления (события поездок, заявки водителей)
    и информационные блоки от администрации. Раньше в приложении были видны только блоки —
    поэтому события поездки приходили лишь в Telegram.
    """

    id: str
    pool: str
    type: str
    title: str
    body: str
    payload: dict | None
    read_at: datetime | None
    created_at: datetime
    source: str  # "notification" | "info_block"


NOTIFICATION_SOURCE = "notification"
INFO_BLOCK_SOURCE = "info_block"


def _info_block_to_feed_item(view) -> FeedItem:
    from app.models.notification import NotificationType

    return FeedItem(
        id=view.id,
        pool=view.pool,
        type=NotificationType.INFO_BLOCK,
        title=view.title,
        body=view.body,
        payload=None,
        read_at=view.read_at,
        created_at=view.created_at,
        source=INFO_BLOCK_SOURCE,
    )


def _notification_to_feed_item(entity: Notification, *, language: str | None) -> FeedItem:
    title, body = resolve_notification_text(entity, language=language)
    return FeedItem(
        id=entity.id,
        pool=entity.pool,
        type=entity.type,
        title=title,
        body=body,
        payload=entity.payload if isinstance(entity.payload, dict) else None,
        read_at=entity.read_at,
        created_at=entity.created_at,
        source=NOTIFICATION_SOURCE,
    )


def _sorted_feed(items: list[FeedItem]) -> list[FeedItem]:
    return sorted(items, key=lambda item: item.created_at, reverse=True)


async def list_feed(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
    info_recipient,
    limit: int,
    offset: int,
    unread_only: bool = False,
    language: str | None = None,
) -> tuple[list[FeedItem], int]:
    """Единая лента: события поездок + информационные блоки, отсортированные по времени.

    Из каждого источника берём только первые `offset + limit` записей — этого достаточно,
    чтобы корректно получить «страницу» объединённой ленты.
    """
    from app.services.info_block_service import (
        count_unread_info_blocks,
        list_info_blocks_for_recipient,
    )

    window = max(1, int(offset) + int(limit))

    notifications, notifications_total = await list_notifications(
        db_session,
        recipient=recipient,
        limit=window,
        offset=0,
        unread_only=unread_only,
    )
    blocks, blocks_total = await list_info_blocks_for_recipient(
        db_session,
        recipient=info_recipient,
        limit=window,
        offset=0,
        unread_only=unread_only,
    )

    merged = _sorted_feed(
        [_notification_to_feed_item(item, language=language) for item in notifications]
        + [_info_block_to_feed_item(block) for block in blocks]
    )
    return merged[offset : offset + limit], notifications_total + blocks_total


async def count_feed_unread(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
    info_recipient,
) -> int:
    from app.services.info_block_service import count_unread_info_blocks

    return await count_unread(db_session, recipient=recipient) + await count_unread_info_blocks(
        db_session,
        recipient=info_recipient,
    )


async def mark_feed_item_read(
    db_session: AsyncSession,
    *,
    item_id: str,
    recipient: NotificationRecipient,
    info_recipient,
    language: str | None = None,
) -> FeedItem | None:
    """Отметить элемент ленты прочитанным: сначала ищем личное уведомление, затем инфо-блок."""
    from app.services.info_block_service import mark_info_block_read

    entity = await mark_read(db_session, notification_id=item_id, recipient=recipient)
    if entity is not None:
        return _notification_to_feed_item(entity, language=language)

    view = await mark_info_block_read(
        db_session,
        info_block_id=item_id,
        recipient=info_recipient,
    )
    if view is None:
        return None
    return _info_block_to_feed_item(view)


async def mark_all_feed_read(
    db_session: AsyncSession,
    *,
    recipient: NotificationRecipient,
    info_recipient,
) -> int:
    from app.services.info_block_service import mark_all_info_blocks_read

    marked = await mark_all_read(db_session, recipient=recipient)
    marked += await mark_all_info_blocks_read(db_session, recipient=info_recipient)
    return marked


def feed_item_to_out(item: FeedItem):
    from app.schemas.notification import NotificationOut

    return NotificationOut(
        id=item.id,
        pool=item.pool,
        type=item.type,
        title=item.title,
        body=item.body,
        payload=item.payload,
        readAt=item.read_at,
        createdAt=item.created_at,
    )
