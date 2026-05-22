from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.dependencies import get_db_session
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User
from app.services.pricing_service import get_or_create_pricing


router = APIRouter(prefix="/points/card")


class CardPurchasePayload(BaseModel):
    points: int = Field(ge=1, le=10000)


class CardPurchaseResult(BaseModel):
    success: bool
    pointsAdded: int
    pointsBalance: int
    eurAmountCents: int


@router.post("/purchase", response_model=CardPurchaseResult)
async def purchase_points_by_card(
    payload: CardPurchasePayload,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    pricing = await get_or_create_pricing(db_session)
    eur_amount_cents = payload.points * int(pricing.point_price_cents)

    current_user.points_balance = int(current_user.points_balance or 0) + payload.points
    transaction = PointsTransaction(
        user_id=current_user.user_id,
        amount=payload.points,
        transaction_type=PointsTransactionType.CARD_PURCHASE,
        eur_amount_cents=eur_amount_cents,
    )
    db_session.add(transaction)
    await db_session.commit()
    await db_session.refresh(current_user)

    return CardPurchaseResult(
        success=True,
        pointsAdded=payload.points,
        pointsBalance=int(current_user.points_balance),
        eurAmountCents=eur_amount_cents,
    )
