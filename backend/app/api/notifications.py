from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import AdminSession, require_admin_roles
from app.api.auth import get_current_user
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.info_block import InfoBlockPool, InfoBlockReadRecipientType
from app.models.notification import NotificationPool, NotificationRecipientType
from app.models.user import User
from app.schemas.notification import (
    CreateInfoBlockIn,
    InfoBlockOut,
    InfoBlockPage,
    NotificationOut,
    NotificationPage,
    UnreadCountOut,
    UpdateInfoBlockIn,
    info_block_to_out,
    notification_to_out,
)
from app.services.info_block_service import (
    InfoBlockRecipient,
    InfoBlockTargetError,
    count_unread_info_blocks,
    create_info_block,
    delete_info_block,
    info_block_to_notification_out,
    list_admin_info_blocks,
    list_info_blocks_for_recipient,
    mark_all_info_blocks_read,
    mark_info_block_read,
    update_info_block,
)
from app.services.notification_service import (
    NotificationRecipient,
    count_unread,
    list_notifications,
    mark_all_read,
    mark_read,
)

passenger_router = APIRouter(prefix="/notifications/passenger")
admin_router = APIRouter(prefix="/admin/notifications")
info_blocks_router = APIRouter(prefix="/admin/info-blocks")


def _passenger_recipient(user: User) -> InfoBlockRecipient:
    return InfoBlockRecipient(
        pool=InfoBlockPool.PASSENGER,
        recipient_type=InfoBlockReadRecipientType.USER,
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
    items, total = await list_info_blocks_for_recipient(
        db_session,
        recipient=_passenger_recipient(current_user),
        limit=limit,
        offset=offset,
        unread_only=unreadOnly,
    )
    return NotificationPage(
        items=[info_block_to_notification_out(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@passenger_router.get("/unread-count", response_model=UnreadCountOut)
async def passenger_unread_count(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    count = await count_unread_info_blocks(db_session, recipient=_passenger_recipient(current_user))
    return UnreadCountOut(count=count)


@passenger_router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_passenger_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    view = await mark_info_block_read(
        db_session,
        info_block_id=notification_id,
        recipient=_passenger_recipient(current_user),
    )
    if view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return info_block_to_notification_out(view)


@passenger_router.post("/read-all", response_model=UnreadCountOut)
async def mark_all_passenger_notifications_read(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    await mark_all_info_blocks_read(db_session, recipient=_passenger_recipient(current_user))
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


@info_blocks_router.get("", response_model=InfoBlockPage)
async def list_info_blocks(
    pool: str = Query(pattern="^(passenger|driver)$"),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    items = await list_admin_info_blocks(db_session, pool=pool)
    return InfoBlockPage(items=[info_block_to_out(item) for item in items], total=len(items))


@info_blocks_router.post("", response_model=InfoBlockOut, status_code=status.HTTP_201_CREATED)
async def create_info_block_endpoint(
    payload: CreateInfoBlockIn,
    session: AdminSession = Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        entity = await create_info_block(
            db_session,
            pool=payload.pool,
            title=payload.title,
            body=payload.body,
            created_by_admin_key_id=session.admin_key_id,
            audience=payload.audience,
            target_username=payload.targetUsername,
        )
    except InfoBlockTargetError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return info_block_to_out(entity)


@info_blocks_router.patch("/{info_block_id}", response_model=InfoBlockOut)
async def update_info_block_endpoint(
    info_block_id: str,
    payload: UpdateInfoBlockIn,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    entity = await update_info_block(
        db_session,
        info_block_id=info_block_id,
        title=payload.title,
        body=payload.body,
        is_active=payload.isActive,
    )
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Info block not found.")
    return info_block_to_out(entity)


@info_blocks_router.delete("/{info_block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_info_block_endpoint(
    info_block_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    deleted = await delete_info_block(db_session, info_block_id=info_block_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Info block not found.")
