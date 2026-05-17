from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.admin_audit_event import AdminAuditEvent
from app.services.driver_qr_sale_service import list_driver_qr_sales


router = APIRouter(prefix="/admin")


class QrSaleAuditEventOut(BaseModel):
    id: str
    action: str
    actorType: str
    actorId: str
    payload: dict
    createdAt: datetime


class QrSaleAuditOut(BaseModel):
    saleId: str
    tokenPreview: str
    driverId: str
    driverName: str | None
    userId: str | None
    username: str | None
    pointsAmount: int
    eurAmount: float
    settlementStatus: str
    createdAt: datetime
    redeemedAt: datetime | None
    events: list[QrSaleAuditEventOut]


class QrSaleAuditPage(BaseModel):
    items: list[QrSaleAuditOut]
    total: int
    limit: int
    offset: int


@router.get("/qr-sales", response_model=QrSaleAuditPage)
async def list_qr_sales_audit(
    driverId: str | None = None,
    userId: str | None = None,
    settlementStatus: str | None = None,
    redeemedOnly: bool | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    rows, total = await list_driver_qr_sales(
        db_session,
        driver_id=driverId,
        redeemed_by_user_id=userId,
        settlement_status=settlementStatus,
        redeemed_only=redeemedOnly,
        limit=limit,
        offset=offset,
    )
    sale_ids = [sale.id for sale, _, _ in rows]
    events_by_sale: dict[str, list[QrSaleAuditEventOut]] = {}
    if sale_ids:
        events_query = await db_session.execute(
            select(AdminAuditEvent)
            .where(
                and_(
                    AdminAuditEvent.resource_type == "driver_qr_sale",
                    AdminAuditEvent.resource_id.in_(sale_ids),
                )
            )
            .order_by(AdminAuditEvent.created_at.asc())
        )
        for event in events_query.scalars().all():
            events_by_sale.setdefault(event.resource_id, []).append(
                QrSaleAuditEventOut(
                    id=event.id,
                    action=event.action,
                    actorType=event.actor_type,
                    actorId=event.actor_id,
                    payload=event.payload or {},
                    createdAt=event.created_at,
                )
            )

    items = [
        QrSaleAuditOut(
            saleId=sale.id,
            tokenPreview=f"{sale.token[:10]}...",
            driverId=sale.driver_id,
            driverName=driver_name,
            userId=sale.redeemed_by_user_id,
            username=username,
            pointsAmount=sale.points_amount,
            eurAmount=round(sale.eur_amount_cents / 100, 2),
            settlementStatus=sale.cash_settlement_status,
            createdAt=sale.created_at,
            redeemedAt=sale.redeemed_at,
            events=events_by_sale.get(sale.id, []),
        )
        for sale, driver_name, username in rows
    ]
    return QrSaleAuditPage(items=items, total=total, limit=limit, offset=offset)
