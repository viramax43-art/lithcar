from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.security import decode_driver_session_token
from app.models.admin_audit_event import AdminAuditAction
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User, UserRole
from app.services.admin_audit_service import add_audit_event
from app.services.driver_qr_sale_service import (
    consume_passenger_qr_sale,
    get_driver_qr_sale_by_token,
    invalidate_passenger_active_qr_sales,
    issue_passenger_qr_sale,
)
from app.services.driver_service import get_driver


router = APIRouter(prefix="/points/qr")


class QrIssuePayload(BaseModel):
    points: int = Field(ge=1, le=100000)


class QrIssueResult(BaseModel):
    success: bool
    saleId: str
    token: str
    qrUrl: str
    points: int
    eurAmount: float


class QrRedeemPayload(BaseModel):
    token: str = Field(min_length=8, max_length=120)


class QrRedeemResult(BaseModel):
    success: bool
    saleId: str
    pointsAdded: int
    passengerPointsBalance: int
    eurAmount: float
    debtStatus: str
    driverId: str
    driverName: str
    passengerId: str


@dataclass
class DriverQrSession:
    driver_id: str


async def get_driver_qr_session(
    request: Request,
    db_session: AsyncSession = Depends(get_db_session),
) -> DriverQrSession:
    token = request.cookies.get(settings.driver_session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver session required.")
    try:
        payload = decode_driver_session_token(token)
    except (JWTError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver session required.") from exc
    driver_id = str(payload.get("driver_id", ""))
    driver = await get_driver(db_session, driver_id=driver_id)
    if not driver:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver session required.")
    return DriverQrSession(driver_id=driver.id)


@router.post("/issue", response_model=QrIssueResult)
async def issue_qr_points(
    payload: QrIssuePayload,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    if current_user.role not in {UserRole.PASSENGER, UserRole.ADMIN, UserRole.MODERATOR}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only passengers can issue QR requests.")
    await invalidate_passenger_active_qr_sales(db_session, issuer_user_id=current_user.user_id)
    sale = await issue_passenger_qr_sale(
        db_session,
        issuer_user_id=current_user.user_id,
        points_amount=payload.points,
    )
    await add_audit_event(
        db_session,
        actor_type="user",
        actor_id=current_user.user_id,
        action=AdminAuditAction.DRIVER_QR_ISSUED,
        resource_type="driver_qr_sale",
        resource_id=sale.id,
        payload={
            "issuerUserId": current_user.user_id,
            "pointsAmount": sale.points_amount,
            "eurAmountCents": sale.eur_amount_cents,
            "settlementStatus": sale.cash_settlement_status,
        },
    )
    await db_session.commit()
    await db_session.refresh(sale)
    base = settings.public_base_url.rstrip("/")
    qr_url = f"{base}/api/points/qr/{sale.token}"
    return QrIssueResult(
        success=True,
        saleId=sale.id,
        token=sale.token,
        qrUrl=qr_url,
        points=sale.points_amount,
        eurAmount=round(sale.eur_amount_cents / 100, 2),
    )


@router.post("/redeem", response_model=QrRedeemResult)
async def redeem_qr_points(
    payload: QrRedeemPayload,
    driver_session: DriverQrSession = Depends(get_driver_qr_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    existing = await get_driver_qr_sale_by_token(db_session, token=payload.token)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR sale token not found.")

    consumed = await consume_passenger_qr_sale(
        db_session,
        token=payload.token,
        redeemed_by_driver_id=driver_session.driver_id,
    )
    if consumed is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="QR sale already redeemed.")

    passenger_id = consumed.issuer_user_id or consumed.redeemed_by_user_id
    if not passenger_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="QR sale has no passenger issuer.")
    passenger = await db_session.get(User, passenger_id)
    if passenger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passenger for this QR was not found.")

    passenger.points_balance = int(passenger.points_balance or 0) + int(consumed.points_amount)
    transaction = PointsTransaction(
        user_id=passenger.user_id,
        amount=consumed.points_amount,
        transaction_type=PointsTransactionType.DRIVER_QR_TOP_UP,
        reference_id=consumed.id,
        eur_amount_cents=consumed.eur_amount_cents,
    )
    db_session.add(transaction)
    await add_audit_event(
        db_session,
        actor_type="driver",
        actor_id=driver_session.driver_id,
        action=AdminAuditAction.DRIVER_QR_REDEEMED,
        resource_type="driver_qr_sale",
        resource_id=consumed.id,
        payload={
            "driverId": consumed.driver_id,
            "passengerId": passenger.user_id,
            "pointsAmount": consumed.points_amount,
            "eurAmountCents": consumed.eur_amount_cents,
            "settlementStatus": consumed.cash_settlement_status,
        },
    )
    await db_session.commit()
    await db_session.refresh(passenger)
    driver = await get_driver(db_session, driver_id=consumed.driver_id)
    driver_name = driver.name if driver is not None else "Unknown driver"
    return QrRedeemResult(
        success=True,
        saleId=consumed.id,
        pointsAdded=consumed.points_amount,
        passengerPointsBalance=passenger.points_balance,
        eurAmount=round(consumed.eur_amount_cents / 100, 2),
        debtStatus=consumed.cash_settlement_status,
        driverId=consumed.driver_id,
        driverName=driver_name,
        passengerId=passenger.user_id,
    )
