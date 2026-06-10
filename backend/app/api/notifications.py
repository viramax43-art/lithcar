from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import AdminSession, require_admin_roles
from app.api.auth import get_current_user
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.notification import NotificationPool, NotificationRecipientType
from app.models.user import User
from app.schemas.notification import (
    AdminSendNotificationIn,
    AdminSendNotificationOut,
    NotificationOut,
    NotificationPage,
    UnreadCountOut,
    notification_to_out,
)
from app.services.notification_service import (
    NotificationRecipient,
    broadcast_to_pool,
    count_unread,
    list_notifications,
    mark_all_read,
    mark_read,
    send_to_recipient,
)

passenger_router = APIRouter(prefix="/notifications/passenger")
admin_router = APIRouter(prefix="/admin/notifications")


def _passenger_recipient(user: User) -> NotificationRecipient:
    return NotificationRecipient(
        pool=NotificationPool.PASSENGER,
        recipient_type=NotificationRecipientType.USER,
        recipient_id=user.user_id,
    )


def _admin_recipient(session: AdminSession) -> NotificationRecipient:
    return NotificationRecipient(
        pool=NotificationPool.ADMIN,
        recipient_type=NotificationRecipientType.ADMIN_KEY,
        recipient_id=session.admin_key_id,
    )


@passenger_router.get("", response_model=NotificationPage)
async def list_passenger_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unreadOnly: bool = False,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    items, total = await list_notifications(
        db_session,
        recipient=_passenger_recipient(current_user),
        limit=limit,
        offset=offset,
        unread_only=unreadOnly,
    )
    return NotificationPage(
        items=[notification_to_out(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@passenger_router.get("/unread-count", response_model=UnreadCountOut)
async def passenger_unread_count(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    count = await count_unread(db_session, recipient=_passenger_recipient(current_user))
    return UnreadCountOut(count=count)


@passenger_router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_passenger_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    entity = await mark_read(
        db_session,
        notification_id=notification_id,
        recipient=_passenger_recipient(current_user),
    )
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return notification_to_out(entity)


@passenger_router.post("/read-all", response_model=UnreadCountOut)
async def mark_all_passenger_notifications_read(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    await mark_all_read(db_session, recipient=_passenger_recipient(current_user))
    return UnreadCountOut(count=0)


@admin_router.get("", response_model=NotificationPage)
async def list_admin_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unreadOnly: bool = False,
    session: AdminSession = Depends(require_admin_roles(
        AdminApiRole.CHIEF_ADMIN,
        AdminApiRole.ADMIN,
        AdminApiRole.MODERATOR,
    )),
    db_session: AsyncSession = Depends(get_db_session),
):
    items, total = await list_notifications(
        db_session,
        recipient=_admin_recipient(session),
        limit=limit,
        offset=offset,
        unread_only=unreadOnly,
    )
    return NotificationPage(
        items=[notification_to_out(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@admin_router.get("/unread-count", response_model=UnreadCountOut)
async def admin_unread_count(
    session: AdminSession = Depends(require_admin_roles(
        AdminApiRole.CHIEF_ADMIN,
        AdminApiRole.ADMIN,
        AdminApiRole.MODERATOR,
    )),
    db_session: AsyncSession = Depends(get_db_session),
):
    count = await count_unread(db_session, recipient=_admin_recipient(session))
    return UnreadCountOut(count=count)


@admin_router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_admin_notification_read(
    notification_id: str,
    session: AdminSession = Depends(require_admin_roles(
        AdminApiRole.CHIEF_ADMIN,
        AdminApiRole.ADMIN,
        AdminApiRole.MODERATOR,
    )),
    db_session: AsyncSession = Depends(get_db_session),
):
    entity = await mark_read(
        db_session,
        notification_id=notification_id,
        recipient=_admin_recipient(session),
    )
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return notification_to_out(entity)


@admin_router.post("/read-all", response_model=UnreadCountOut)
async def mark_all_admin_notifications_read(
    session: AdminSession = Depends(require_admin_roles(
        AdminApiRole.CHIEF_ADMIN,
        AdminApiRole.ADMIN,
        AdminApiRole.MODERATOR,
    )),
    db_session: AsyncSession = Depends(get_db_session),
):
    await mark_all_read(db_session, recipient=_admin_recipient(session))
    return UnreadCountOut(count=0)


@admin_router.post("/send", response_model=AdminSendNotificationOut)
async def admin_send_notification(
    payload: AdminSendNotificationIn,
    session: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    if payload.mode == "single":
        if not payload.recipientId:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="recipientId is required for single mode.")
        entity = await send_to_recipient(
            db_session,
            pool=payload.pool,
            recipient_id=payload.recipientId,
            title=payload.title.strip(),
            body=payload.body.strip(),
            created_by_admin_key_id=session.admin_key_id,
            send_telegram=payload.sendTelegram,
        )
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found.")
        return AdminSendNotificationOut(sentCount=1)

    sent_count = await broadcast_to_pool(
        db_session,
        pool=payload.pool,
        title=payload.title.strip(),
        body=payload.body.strip(),
        created_by_admin_key_id=session.admin_key_id,
        send_telegram=payload.sendTelegram,
    )
    return AdminSendNotificationOut(sentCount=sent_count)
