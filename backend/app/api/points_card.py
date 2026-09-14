from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.dependencies import get_db_session, get_http_client
from app.models.user import User
from app.services.payment_service import PaymentNotConfiguredError, PaymentService


router = APIRouter(prefix="/points/card")


class CardPurchasePayload(BaseModel):
    points: int = Field(ge=1, le=10000)


class CardPurchaseResult(BaseModel):
    success: bool
    pointsAdded: int | None = None
    pointsBalance: int | None = None
    eurAmountCents: int | None = None
    confirmationUrl: str | None = None
    paymentId: str | None = None


@router.post("/purchase", response_model=CardPurchaseResult)
async def purchase_points_by_card(
    payload: CardPurchasePayload,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
    http_client=Depends(get_http_client),
):
    payment_service = PaymentService(db_session, http_client=http_client)
    try:
        payment = await payment_service.create_points_payment(
            user=current_user,
            points=payload.points,
        )
    except PaymentNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail="Card payments are not configured. Set YOOKASSA_* env variables.",
        ) from None

    confirmation = payment.get("confirmation") or {}
    return CardPurchaseResult(
        success=True,
        confirmationUrl=confirmation.get("confirmation_url"),
        paymentId=payment.get("id"),
    )


@router.post("/webhook/yookassa")
async def yookassa_webhook(
    request: Request,
    db_session: AsyncSession = Depends(get_db_session),
):
    body = await request.body()
    signature = request.headers.get("X-Content-HMAC-Signature", "")
    payment_service = PaymentService(db_session)
    try:
        await payment_service.handle_webhook(body, signature)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"ok": True}
