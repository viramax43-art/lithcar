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
