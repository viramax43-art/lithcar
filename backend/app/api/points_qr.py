from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.dependencies import get_db_session
from app.models.admin_audit_event import AdminAuditAction
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User
from app.services.admin_audit_service import add_audit_event
from app.services.driver_qr_sale_service import consume_driver_qr_sale, get_driver_qr_sale_by_token
from app.services.driver_service import get_driver


router = APIRouter(prefix="/points/qr")


class QrRedeemPayload(BaseModel):
    token: str = Field(min_length=8, max_length=120)


class QrRedeemResult(BaseModel):
    success: bool
    saleId: str
    pointsAdded: int
    pointsBalance: int
    eurAmount: float
    debtStatus: str
    driverId: str
    driverName: str


@router.post("/redeem", response_model=QrRedeemResult)
async def redeem_qr_points(
    payload: QrRedeemPayload,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await get_driver_qr_sale_by_token(db_session, token=payload.token)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR sale token not found.")

    consumed = await consume_driver_qr_sale(
        db_session,
        token=payload.token,
        redeemed_by_user_id=current_user.user_id,
    )
    if consumed is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="QR sale already redeemed.")

    current_user.points_balance = int(current_user.points_balance or 0) + int(consumed.points_amount)
    transaction = PointsTransaction(
        user_id=current_user.user_id,
        amount=consumed.points_amount,
        transaction_type=PointsTransactionType.DRIVER_QR_TOP_UP,
        reference_id=consumed.id,
        eur_amount_cents=consumed.eur_amount_cents,
    )
    db_session.add(transaction)
    await add_audit_event(
        db_session,
        actor_type="user",
        actor_id=current_user.user_id,
        action=AdminAuditAction.DRIVER_QR_REDEEMED,
        resource_type="driver_qr_sale",
        resource_id=consumed.id,
        payload={
            "driverId": consumed.driver_id,
            "redeemedByUserId": current_user.user_id,
            "pointsAmount": consumed.points_amount,
            "eurAmountCents": consumed.eur_amount_cents,
            "settlementStatus": consumed.cash_settlement_status,
        },
    )
    await db_session.commit()
    await db_session.refresh(current_user)
    driver = await get_driver(db_session, driver_id=consumed.driver_id)
    driver_name = driver.name if driver is not None else "Unknown driver"
    return QrRedeemResult(
        success=True,
        saleId=consumed.id,
        pointsAdded=consumed.points_amount,
        pointsBalance=current_user.points_balance,
        eurAmount=round(consumed.eur_amount_cents / 100, 2),
        debtStatus=consumed.cash_settlement_status,
        driverId=consumed.driver_id,
        driverName=driver_name,
    )
