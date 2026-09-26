from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User, UserRole
from app.services.rating_service import get_user_rating_aggregate

router = APIRouter(prefix="/admin/passengers", tags=["Admin Passengers"])


class PassengerOut(BaseModel):
    userId: str
    username: str | None
    displayName: str | None
    role: str
    language: str
    pointsBalance: int
    rating: float | None
    ratingCount: int


class PassengerListOut(BaseModel):
    items: list[PassengerOut]
    total: int
    limit: int
    offset: int


class PassengerPointsPatch(BaseModel):
    delta: int | None = Field(default=None, description="Relative change (+/-)")
    absolute: int | None = Field(default=None, ge=0, description="Set balance to exact value")
    reason: str = Field(default="Admin adjustment", max_length=200)


async def _passenger_out(db_session: AsyncSession, user: User) -> PassengerOut:
    aggregate = await get_user_rating_aggregate(db_session, user.user_id)
    return PassengerOut(
        userId=user.user_id,
        username=user.username,
        displayName=user.username or user.user_id,
        role=user.role or UserRole.PASSENGER,
        language=user.language or "ru",
        pointsBalance=int(user.points_balance or 0),
        rating=aggregate.rating,
        ratingCount=aggregate.rating_count,
    )


@router.get("", response_model=PassengerListOut)
async def list_passengers(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    query = select(User)
    if q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(User.username).like(term),
                User.user_id.like(term),
            )
        )
    count_q = select(func.count()).select_from(query.subquery())
    total = int((await db_session.execute(count_q)).scalar_one())
    rows = (
        await db_session.execute(query.order_by(User.user_id.desc()).limit(limit).offset(offset))
    ).scalars().all()

    items = [await _passenger_out(db_session, u) for u in rows]
    return PassengerListOut(items=items, total=total, limit=limit, offset=offset)


@router.patch("/{user_id}/points", response_model=PassengerOut)
async def adjust_passenger_points(
    user_id: str,
    payload: PassengerPointsPatch,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    if payload.delta is None and payload.absolute is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide delta or absolute")
    if payload.delta is not None and payload.absolute is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use delta or absolute, not both")

    user = await db_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    before = int(user.points_balance or 0)
    if payload.absolute is not None:
        after = int(payload.absolute)
    else:
        after = before + int(payload.delta or 0)
    if after < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Balance cannot be negative")

    user.points_balance = after
    change = after - before
    if change != 0:
        db_session.add(
            PointsTransaction(
                user_id=user.user_id,
                amount=change,
                transaction_type=PointsTransactionType.ADMIN_ADJUSTMENT,
                reference_id=None,
            )
        )
    await db_session.commit()
    await db_session.refresh(user)
    return await _passenger_out(db_session, user)
