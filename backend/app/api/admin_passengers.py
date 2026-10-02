from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.models.driver import Driver
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.ride_request import RideRequest
from app.models.user import User, UserRole
from app.models.user_block import UserBlock
from app.services.driver_service import is_driver_online
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


class RideBriefOut(BaseModel):
    id: str
    rideNumber: int
    fromAddress: str
    toAddress: str
    dateTime: datetime
    status: str
    driverId: str | None
    quotedPoints: int | None
    quotedPriceCents: int | None


class PointsTxnBriefOut(BaseModel):
    id: str
    amount: int
    transactionType: str
    createdAt: datetime


class DriverProfileOut(BaseModel):
    id: str
    name: str
    carBrand: str
    carModel: str
    carPlate: str
    vehicleColor: str
    seatsCount: int
    about: str
    rating: float
    isOnline: bool
    canSellPoints: bool
    canSelfAssign: bool


class UserDossierOut(BaseModel):
    userId: str
    username: str | None
    role: str
    language: str
    pointsBalance: int
    rating: float | None
    ratingCount: int
    createdAt: datetime
    onboardingCompleted: bool
    blockedByCount: int
    blockingCount: int
    driver: DriverProfileOut | None
    ridesAsPassenger: list[RideBriefOut]
    ridesAsDriver: list[RideBriefOut]
    pointsTransactions: list[PointsTxnBriefOut]


def _ride_brief(ride: RideRequest) -> RideBriefOut:
    return RideBriefOut(
        id=ride.id,
        rideNumber=ride.ride_number,
        fromAddress=ride.from_address,
        toAddress=ride.to_address,
        dateTime=ride.date_time,
        status=ride.status,
        driverId=ride.driver_id,
        quotedPoints=ride.quoted_points,
        quotedPriceCents=ride.quoted_price_cents,
    )


@router.get("/{user_id}/dossier", response_model=UserDossierOut)
async def get_user_dossier(
    user_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    user = await db_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    aggregate = await get_user_rating_aggregate(db_session, user_id)

    driver = (
        await db_session.execute(select(Driver).where(Driver.user_id == user_id))
    ).scalar_one_or_none()
    driver_out: DriverProfileOut | None = None
    driver_id: str | None = None
    if driver is not None:
        driver_id = driver.id
        driver_out = DriverProfileOut(
            id=driver.id,
            name=driver.name,
            carBrand=driver.car_brand,
            carModel=driver.car_model,
            carPlate=driver.car_plate,
            vehicleColor=driver.vehicle_color,
            seatsCount=driver.seats_count,
            about=driver.about,
            rating=driver.rating,
            isOnline=is_driver_online(driver, online_timeout_seconds=settings.driver_online_ttl_seconds),
            canSellPoints=driver.can_sell_points,
            canSelfAssign=driver.can_self_assign,
        )

    rides_as_passenger = (
        await db_session.execute(
            select(RideRequest)
            .where(RideRequest.passenger_id == user_id)
            .order_by(RideRequest.date_time.desc(), RideRequest.ride_number.desc())
            .limit(20)
        )
    ).scalars().all()

    rides_as_driver: list[RideRequest] = []
    if driver_id is not None:
        rides_as_driver = (
            await db_session.execute(
                select(RideRequest)
                .where(RideRequest.driver_id == driver_id)
                .order_by(RideRequest.date_time.desc(), RideRequest.ride_number.desc())
                .limit(20)
            )
        ).scalars().all()

    transactions = (
        await db_session.execute(
            select(PointsTransaction)
            .where(PointsTransaction.user_id == user_id)
            .order_by(PointsTransaction.created_at.desc())
            .limit(30)
        )
    ).scalars().all()

    blocked_by_count = int(
        (
            await db_session.execute(
                select(func.count()).select_from(UserBlock).where(UserBlock.blocked_user_id == user_id)
            )
        ).scalar_one()
    )
    blocking_count = int(
        (
            await db_session.execute(
                select(func.count()).select_from(UserBlock).where(UserBlock.blocker_user_id == user_id)
            )
        ).scalar_one()
    )

    return UserDossierOut(
        userId=user.user_id,
        username=user.username,
        role=user.role or UserRole.PASSENGER,
        language=user.language or "ru",
        pointsBalance=int(user.points_balance or 0),
        rating=aggregate.rating,
        ratingCount=aggregate.rating_count,
        createdAt=user.created_at,
        onboardingCompleted=bool(user.onboarding_completed),
        blockedByCount=blocked_by_count,
        blockingCount=blocking_count,
        driver=driver_out,
        ridesAsPassenger=[_ride_brief(r) for r in rides_as_passenger],
        ridesAsDriver=[_ride_brief(r) for r in rides_as_driver],
        pointsTransactions=[
            PointsTxnBriefOut(
                id=t.id,
                amount=t.amount,
                transactionType=t.transaction_type,
                createdAt=t.created_at,
            )
            for t in transactions
        ],
    )
