from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.security import (
    create_driver_session_token,
    decode_driver_session_token,
)
from app.services.driver_service import (
    get_driver,
    get_driver_by_raw_key,
    touch_driver_online,
    update_driver_location,
    update_driver_online,
)
from app.models.admin_audit_event import AdminAuditAction
from app.models.driver_qr_sale import DriverQrSaleSettlementStatus
from app.services.admin_audit_service import add_audit_event
from app.services.driver_qr_sale_service import (
    invalidate_driver_active_qr_sales,
    issue_driver_qr_sale,
    list_driver_debts_summary,
)
from app.services.pricing_service import get_or_create_pricing
from app.services.ride_request_service import (
    list_driver_requests,
    update_driver_ride_status,
)


router = APIRouter(prefix="/driver")


class DriverKeyLoginPayload(BaseModel):
    key: str = Field(min_length=10)


class DriverSessionOut(BaseModel):
    driverId: str
    name: str
    canSellPoints: bool


class LatLngOut(BaseModel):
    lat: float
    lng: float


class DriverRideOut(BaseModel):
    id: str
    fromAddress: str
    toAddress: str
    fromLatLng: LatLngOut
    toLatLng: LatLngOut
    passengerName: str
    passengerPhone: str
    status: str
    dateTime: datetime
    createdAt: datetime


class DriverRideStatusUpdate(BaseModel):
    status: str


class DriverCabinetOut(BaseModel):
    session: DriverSessionOut
    rides: list[DriverRideOut]
    driverDebtEur: float
    recentQrSales: list[DriverDebtSaleOut]
    total: int
    limit: int
    offset: int


class DriverOnlineUpdate(BaseModel):
    isOnline: bool


class DriverLocationUpdate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


@dataclass
class DriverSession:
    driver_id: str
    name: str
    can_sell_points: bool


class DriverQrSaleIssuePayload(BaseModel):
    points: int = Field(ge=1, le=100000)


class DriverQrSaleIssueOut(BaseModel):
    saleId: str
    token: str
    qrUrl: str
    points: int
    eurAmount: float


class DriverDebtSaleOut(BaseModel):
    saleId: str
    points: int
    eurAmount: float
    redeemedAt: datetime | None
    settlementStatus: str


async def get_driver_session_optional(
    request: Request,
    db_session: AsyncSession = Depends(get_db_session),
) -> DriverSession | None:
    token = request.cookies.get(settings.driver_session_cookie_name)
    if not token:
        return None
    try:
        payload = decode_driver_session_token(token)
    except (JWTError, ValueError):
        return None
    driver = await get_driver(db_session, driver_id=str(payload.get("driver_id", "")))
    if driver is None:
        return None
    return DriverSession(
        driver_id=driver.id,
        name=driver.name,
        can_sell_points=driver.can_sell_points,
    )


async def get_driver_session(
    session: DriverSession | None = Depends(get_driver_session_optional),
) -> DriverSession:
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver session required.")
    return session


@router.post("/session/login", response_model=DriverSessionOut)
async def driver_login_with_key(
    payload: DriverKeyLoginPayload,
    response: Response,
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await get_driver_by_raw_key(db_session, raw_key=payload.key)
    if driver is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid driver key.")
    driver = await touch_driver_online(db_session, driver_id=driver.id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found.")

    token = create_driver_session_token(driver_id=driver.id)
    response.set_cookie(
        key=settings.driver_session_cookie_name,
        value=token,
        max_age=settings.driver_session_ttl_hours * 3600,
        httponly=True,
        secure=settings.admin_session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return DriverSessionOut(driverId=driver.id, name=driver.name, canSellPoints=driver.can_sell_points)


@router.post("/session/logout")
async def driver_logout(
    response: Response,
    session: DriverSession | None = Depends(get_driver_session_optional),
    db_session: AsyncSession = Depends(get_db_session),
):
    if session is not None:
        await update_driver_online(db_session, driver_id=session.driver_id, is_online=False)
    response.delete_cookie(
        key=settings.driver_session_cookie_name,
        httponly=True,
        secure=settings.admin_session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return {"success": True}


@router.get("/session/me", response_model=DriverSessionOut)
async def driver_session_me(session: DriverSession = Depends(get_driver_session)):
    return DriverSessionOut(driverId=session.driver_id, name=session.name, canSellPoints=session.can_sell_points)


@router.get("/cabinet", response_model=DriverCabinetOut)
async def driver_cabinet(
    limit: int = Query(default=30, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    rides, total = await list_driver_requests(
        db_session,
        driver_id=session.driver_id,
        limit=limit,
        offset=offset,
    )
    debt_total_cents, debt_items = await list_driver_debts_summary(
        db_session,
        driver_id=session.driver_id,
        limit=20,
    )
    return DriverCabinetOut(
        session=DriverSessionOut(
            driverId=session.driver_id,
            name=session.name,
            canSellPoints=session.can_sell_points,
        ),
        rides=[
            DriverRideOut(
                id=item.id,
                fromAddress=item.from_address,
                toAddress=item.to_address,
                fromLatLng=LatLngOut(lat=item.from_lat, lng=item.from_lng),
                toLatLng=LatLngOut(lat=item.to_lat, lng=item.to_lng),
                passengerName=item.passenger_name,
                passengerPhone=item.passenger_phone,
                status=item.status,
                dateTime=item.date_time,
                createdAt=item.created_at,
            )
            for item in rides
        ],
        driverDebtEur=round(debt_total_cents / 100, 2),
        recentQrSales=[
            DriverDebtSaleOut(
                saleId=item.id,
                points=item.points_amount,
                eurAmount=round(item.eur_amount_cents / 100, 2),
                redeemedAt=item.redeemed_at,
                settlementStatus=item.cash_settlement_status,
            )
            for item in debt_items
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch("/cabinet/online", response_model=DriverSessionOut)
async def set_driver_online(
    payload: DriverOnlineUpdate,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    if payload.isOnline:
        updated = await touch_driver_online(
            db_session,
            driver_id=session.driver_id,
        )
    else:
        updated = await update_driver_online(
            db_session,
            driver_id=session.driver_id,
            is_online=False,
        )
    if updated is None:
        raise HTTPException(status_code=404, detail="Driver profile not found.")
    return DriverSessionOut(driverId=updated.id, name=updated.name, canSellPoints=updated.can_sell_points)


@router.post("/cabinet/qr-sales/issue", response_model=DriverQrSaleIssueOut)
async def issue_driver_qr_sale_endpoint(
    payload: DriverQrSaleIssuePayload,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await get_driver(db_session, driver_id=session.driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found.")
    if not driver.can_sell_points:
        raise HTTPException(status_code=403, detail="Driver cannot sell points.")

    await invalidate_driver_active_qr_sales(db_session, driver_id=session.driver_id)
    pricing = await get_or_create_pricing(db_session)
    sale = await issue_driver_qr_sale(
        db_session,
        driver_id=session.driver_id,
        points_amount=payload.points,
    )
    await add_audit_event(
        db_session,
        actor_type="driver",
        actor_id=session.driver_id,
        action=AdminAuditAction.DRIVER_QR_ISSUED,
        resource_type="driver_qr_sale",
        resource_id=sale.id,
        payload={
            "driverId": session.driver_id,
            "pointsAmount": sale.points_amount,
            "eurAmountCents": sale.eur_amount_cents,
            "pricingPointPriceCents": pricing.point_price_cents,
            "settlementStatus": DriverQrSaleSettlementStatus.OWED_TO_DRIVER,
        },
    )
    await db_session.commit()
    await db_session.refresh(sale)
    base = settings.public_base_url.rstrip("/")
    qr_url = f"{base}/api/points/qr/{sale.token}"
    return DriverQrSaleIssueOut(
        saleId=sale.id,
        token=sale.token,
        qrUrl=qr_url,
        points=sale.points_amount,
        eurAmount=round(sale.eur_amount_cents / 100, 2),
    )


@router.post("/cabinet/location")
async def update_cabinet_location(
    payload: DriverLocationUpdate,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    # Also refresh online status — receiving a location implies the driver is active.
    await touch_driver_online(db_session, driver_id=session.driver_id)
    updated = await update_driver_location(
        db_session,
        driver_id=session.driver_id,
        lat=payload.lat,
        lng=payload.lng,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Driver profile not found.")
    return {"success": True, "lat": updated.current_lat, "lng": updated.current_lng}


@router.patch("/cabinet/rides/{request_id}/status", response_model=DriverRideOut)
async def update_cabinet_ride_status(
    request_id: str,
    payload: DriverRideStatusUpdate,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride, error = await update_driver_ride_status(
        db_session,
        request_id=request_id,
        driver_id=session.driver_id,
        target_status=payload.status,
    )
    if ride is None:
        raise HTTPException(status_code=404, detail=error or "Поездка не найдена.")
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    return DriverRideOut(
        id=ride.id,
        fromAddress=ride.from_address,
        toAddress=ride.to_address,
        fromLatLng=LatLngOut(lat=ride.from_lat, lng=ride.from_lng),
        toLatLng=LatLngOut(lat=ride.to_lat, lng=ride.to_lng),
        passengerName=ride.passenger_name,
        passengerPhone=ride.passenger_phone,
        status=ride.status,
        dateTime=ride.date_time,
        createdAt=ride.created_at,
    )
