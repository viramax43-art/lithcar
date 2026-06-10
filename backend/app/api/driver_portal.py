from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_timezone import to_app_local_iso
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.models.user import User
from app.core.security import decode_driver_session_token
from app.services.driver_login_token_service import redeem_driver_login_token
from app.services.driver_session_service import apply_driver_session_cookie
from app.services.driver_service import (
    get_driver,
    get_driver_by_raw_key,
    touch_driver_online,
    update_driver_location,
    update_driver_online,
)
from app.models.info_block import InfoBlockPool, InfoBlockReadRecipientType
from app.schemas.notification import NotificationOut, NotificationPage, UnreadCountOut
from app.services.info_block_service import (
    InfoBlockRecipient,
    count_unread_info_blocks,
    info_block_to_notification_out,
    list_info_blocks_for_recipient,
    mark_all_info_blocks_read,
    mark_info_block_read,
    resolve_recipient_language,
)
from app.services.notification_service import normalize_notification_language
from app.services.passenger_notification_service import (
    notify_passenger_driver_assigned,
    notify_passenger_status_changed,
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
from app.services.rating_service import (
    RatingError,
    get_driver_rating_aggregate,
    get_ride_rating_context_for_driver,
    get_user_rating_aggregate,
    submit_driver_rating,
)
from app.services.ride_request_service import (
    ClaimRideError,
    apply_driver_point_action,
    claim_ride_by_driver,
    get_request,
    list_driver_requests,
    list_unassigned_rides,
    reset_driver_pickup_point,
    update_driver_ride_status,
)


router = APIRouter(prefix="/driver")


class DriverKeyLoginPayload(BaseModel):
    key: str = Field(min_length=10)


class DriverSessionOut(BaseModel):
    driverId: str
    name: str
    canSellPoints: bool
    canSelfAssign: bool = False
    rating: float = 5.0
    ratingCount: int = 0


class DriverRideRatingSubmitPayload(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class DriverRideRatingOut(BaseModel):
    canRate: bool
    myScore: int | None = None
    myComment: str | None = None


class LatLngOut(BaseModel):
    lat: float
    lng: float


class DriverRideOut(BaseModel):
    id: str
    rideNumber: int
    fromAddress: str
    toAddress: str
    fromLatLng: LatLngOut
    toLatLng: LatLngOut
    passengerName: str
    status: str
    dateTime: datetime
    dateTimeLocal: str
    createdAt: datetime
    routeOrder: int | None
    pickupChangedByDriver: bool
    pickupNotifiedAt: datetime | None
    pickupConfirmedAt: datetime | None
    rating: DriverRideRatingOut | None = None


class DriverRideStatusUpdate(BaseModel):
    status: str


class DriverPickupUpdate(BaseModel):
    fromAddress: str = Field(min_length=1)
    fromLat: float = Field(ge=-90, le=90)
    fromLng: float = Field(ge=-180, le=180)


class DriverRoutePointUpdate(BaseModel):
    address: str = Field(min_length=1)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class DriverRouteUpdate(BaseModel):
    fromPoint: DriverRoutePointUpdate | None = None
    toPoint: DriverRoutePointUpdate | None = None


class DriverPointActionPayload(BaseModel):
    action: str = Field(min_length=1)


class DriverMapLinkOut(BaseModel):
    google: str
    apple: str
    yandex: str
    geo: str


class DriverMapPointOut(BaseModel):
    id: str
    rideId: str
    rideNumber: int
    pointType: str
    passengerName: str
    passengerTelegramId: str
    passengerTelegramUsername: str | None
    address: str
    latLng: LatLngOut
    rideStatus: str
    pointStatus: str
    recommendedOrder: int | None
    canEdit: bool
    availableActions: list[str]
    mapLinks: DriverMapLinkOut
    dateTime: datetime
    dateTimeLocal: str
    pickupChangedByDriver: bool
    pickupNotifiedAt: datetime | None
    pickupConfirmedAt: datetime | None
    passengerRating: float = 5.0
    passengerRatingCount: int = 0
    pointKind: str = "mine"


class DriverMapOut(BaseModel):
    session: DriverSessionOut
    points: list[DriverMapPointOut]
    availablePoints: list[DriverMapPointOut] = []
    activeRides: int
    totalRides: int


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
    can_self_assign: bool


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
        can_self_assign=driver.can_self_assign,
    )


async def get_driver_session(
    session: DriverSession | None = Depends(get_driver_session_optional),
) -> DriverSession:
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver session required.")
    return session


async def _to_driver_session_out(
    db_session: AsyncSession,
    *,
    driver_id: str,
    name: str,
    can_sell_points: bool,
    can_self_assign: bool,
) -> DriverSessionOut:
    aggregate = await get_driver_rating_aggregate(db_session, driver_id)
    return DriverSessionOut(
        driverId=driver_id,
        name=name,
        canSellPoints=can_sell_points,
        canSelfAssign=can_self_assign,
        rating=aggregate.rating,
        ratingCount=aggregate.rating_count,
    )


def _to_driver_ride_rating_out(ctx) -> DriverRideRatingOut:
    return DriverRideRatingOut(
        canRate=ctx.can_rate,
        myScore=ctx.my_score,
        myComment=ctx.my_comment,
    )


async def _to_driver_ride_out(
    db_session: AsyncSession,
    ride,
    *,
    driver_id: str,
) -> DriverRideOut:
    rating_ctx = await get_ride_rating_context_for_driver(
        db_session,
        ride=ride,
        driver_id=driver_id,
    )
    return DriverRideOut(
        id=ride.id,
        rideNumber=ride.ride_number,
        fromAddress=ride.from_address,
        toAddress=ride.to_address,
        fromLatLng=LatLngOut(lat=ride.from_lat, lng=ride.from_lng),
        toLatLng=LatLngOut(lat=ride.to_lat, lng=ride.to_lng),
        passengerName=ride.passenger_name,
        status=ride.status,
        dateTime=ride.date_time,
        dateTimeLocal=to_app_local_iso(ride.date_time),
        createdAt=ride.created_at,
        routeOrder=ride.route_order,
        pickupChangedByDriver=ride.pickup_changed_by_driver,
        pickupNotifiedAt=ride.pickup_notified_at,
        pickupConfirmedAt=ride.pickup_confirmed_at,
        rating=_to_driver_ride_rating_out(rating_ctx),
    )


def _point_status_for(*, ride_status: str, point_type: str) -> str:
    if point_type == "pickup":
        if ride_status in {"assigned"}:
            return "pending"
        if ride_status in {"en_route_to_pickup"}:
            return "en_route"
        return "done"
    if ride_status in {"in_progress"}:
        return "en_route"
    if ride_status in {"completed"}:
        return "done"
    return "pending"


def _available_actions_for(*, ride_status: str, point_type: str) -> list[str]:
    if point_type == "pickup":
        if ride_status == "assigned":
            return ["start"]
        if ride_status == "en_route_to_pickup":
            return ["arrived"]
        if ride_status == "awaiting_passenger":
            return ["complete"]
        return []
    if ride_status == "awaiting_passenger":
        return ["start"]
    if ride_status == "in_progress":
        return ["arrived", "complete"]
    return []


def _build_map_links(*, lat: float, lng: float, label: str) -> DriverMapLinkOut:
    latlng = f"{lat},{lng}"
    safe_label = quote_plus(label)
    return DriverMapLinkOut(
        google=f"https://www.google.com/maps/search/?api=1&query={latlng}",
        apple=f"https://maps.apple.com/?ll={latlng}&q={safe_label}",
        yandex=f"https://yandex.com/maps/?pt={lng},{lat}&z=16&l=map",
        geo=f"geo:{latlng}?q={latlng}({safe_label})",
    )


def _compute_dynamic_ride_order(
    rides: list,
    *,
    driver_lat: float | None,
    driver_lng: float | None,
) -> dict[str, int]:
    """Sort rides by nearest-neighbor from driver's current position.

    In-progress and en-route rides are always first (driver already committed).
    Remaining pending rides are sorted greedily by distance from current position.
    Returns a mapping of ride.id → 1-based order index.
    """
    from app.services.geo_service import haversine_km

    active: list = []
    pending: list = []
    for r in rides:
        if r.status in ("en_route_to_pickup", "awaiting_passenger", "in_progress"):
            active.append(r)
        else:
            pending.append(r)

    order: dict[str, int] = {}
    seq = 1
    for r in sorted(active, key=lambda x: (x.route_order or 9999, x.created_at)):
        order[r.id] = seq
        seq += 1

    if driver_lat is not None and driver_lng is not None:
        cur_lat, cur_lng = driver_lat, driver_lng
    elif pending:
        cur_lat = sum(r.from_lat for r in pending) / len(pending)
        cur_lng = sum(r.from_lng for r in pending) / len(pending)
    else:
        return order

    remaining = list(pending)
    while remaining:
        closest = min(remaining, key=lambda r: haversine_km(cur_lat, cur_lng, r.from_lat, r.from_lng))
        remaining.remove(closest)
        order[closest.id] = seq
        seq += 1
        cur_lat, cur_lng = closest.to_lat, closest.to_lng

    return order


def _build_driver_map_points(
    *,
    rides: list,
    username_by_user_id: dict[str, str | None],
    passenger_rating_by_user_id: dict[str, tuple[float, int]],
    driver_lat: float | None = None,
    driver_lng: float | None = None,
    point_kind: str = "mine",
) -> list[DriverMapPointOut]:
    compute_order = point_kind == "mine"
    ride_order: dict[str, int] = {}
    if compute_order:
        ride_order = _compute_dynamic_ride_order(rides, driver_lat=driver_lat, driver_lng=driver_lng)
    sorted_rides = (
        sorted(rides, key=lambda r: (ride_order.get(r.id, 9999), r.created_at))
        if compute_order
        else sorted(rides, key=lambda r: (r.date_time, r.created_at))
    )
    points: list[DriverMapPointOut] = []
    for idx, ride in enumerate(sorted_rides):
        order_base = (ride_order.get(ride.id) or (idx + 1)) * 2 if compute_order else None
        for point_type in ("pickup", "dropoff"):
            is_pickup = point_type == "pickup"
            lat = ride.from_lat if is_pickup else ride.to_lat
            lng = ride.from_lng if is_pickup else ride.to_lng
            address = ride.from_address if is_pickup else ride.to_address
            label = f"#{ride.ride_number} {point_type}"
            passenger_rating, passenger_rating_count = passenger_rating_by_user_id.get(
                ride.passenger_id,
                (5.0, 0),
            )
            if point_kind == "available":
                point_status = "pending"
                recommended_order = None
                can_edit = False
                available_actions: list[str] = []
                ride_status = ride.status
            else:
                point_status = _point_status_for(ride_status=ride.status, point_type=point_type)
                recommended_order = order_base - 1 if is_pickup else order_base
                can_edit = ride.status in {
                    "assigned",
                    "en_route_to_pickup",
                    "awaiting_passenger",
                    "in_progress",
                }
                available_actions = _available_actions_for(
                    ride_status=ride.status, point_type=point_type
                )
                ride_status = ride.status
            points.append(
                DriverMapPointOut(
                    id=f"{ride.id}:{point_type}",
                    rideId=ride.id,
                    rideNumber=ride.ride_number,
                    pointType=point_type,
                    passengerName=ride.passenger_name,
                    passengerTelegramId=ride.passenger_id,
                    passengerTelegramUsername=username_by_user_id.get(ride.passenger_id),
                    address=address,
                    latLng=LatLngOut(lat=lat, lng=lng),
                    rideStatus=ride_status,
                    pointStatus=point_status,
                    recommendedOrder=recommended_order,
                    canEdit=can_edit,
                    availableActions=available_actions,
                    mapLinks=_build_map_links(lat=lat, lng=lng, label=label),
                    dateTime=ride.date_time,
                    dateTimeLocal=to_app_local_iso(ride.date_time),
                    pickupChangedByDriver=ride.pickup_changed_by_driver if is_pickup else False,
                    pickupNotifiedAt=ride.pickup_notified_at if is_pickup else None,
                    pickupConfirmedAt=ride.pickup_confirmed_at if is_pickup else None,
                    passengerRating=passenger_rating,
                    passengerRatingCount=passenger_rating_count,
                    pointKind=point_kind,
                )
            )
    return points


async def _load_passenger_context(
    db_session: AsyncSession,
    *,
    passenger_ids: list[str],
) -> tuple[dict[str, str | None], dict[str, tuple[float, int]]]:
    username_by_user_id: dict[str, str | None] = {}
    passenger_rating_by_user_id: dict[str, tuple[float, int]] = {}
    if not passenger_ids:
        return username_by_user_id, passenger_rating_by_user_id
    user_rows = await db_session.execute(select(User).where(User.user_id.in_(passenger_ids)))
    users = user_rows.scalars().all()
    username_by_user_id = {user.user_id: user.username for user in users}
    for user in users:
        aggregate = await get_user_rating_aggregate(db_session, user.user_id)
        passenger_rating_by_user_id[user.user_id] = (
            aggregate.rating,
            aggregate.rating_count,
        )
    return username_by_user_id, passenger_rating_by_user_id


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

    apply_driver_session_cookie(response, driver_id=driver.id)
    return await _to_driver_session_out(
        db_session,
        driver_id=driver.id,
        name=driver.name,
        can_sell_points=driver.can_sell_points,
        can_self_assign=driver.can_self_assign,
    )


@router.get("/session/enter/{token}")
async def driver_login_with_magic_link(
    token: str,
    db_session: AsyncSession = Depends(get_db_session),
):
    frontend_base = settings.frontend_public_url.strip().rstrip("/")
    try:
        redemption = await redeem_driver_login_token(db_session, raw_token=token)
    except HTTPException as error:
        if error.status_code == status.HTTP_401_UNAUTHORIZED:
            return RedirectResponse(
                url=f"{frontend_base}/driver?login=invalid",
                status_code=status.HTTP_302_FOUND,
            )
        raise
    driver = await get_driver(db_session, driver_id=redemption.driver_id)
    if driver is None:
        return RedirectResponse(
            url=f"{frontend_base}/driver?login=invalid",
            status_code=status.HTTP_302_FOUND,
        )
    driver = await touch_driver_online(db_session, driver_id=driver.id)
    if driver is None:
        return RedirectResponse(
            url=f"{frontend_base}/driver?login=invalid",
            status_code=status.HTTP_302_FOUND,
        )
    redirect = RedirectResponse(url=f"{frontend_base}/driver", status_code=status.HTTP_302_FOUND)
    apply_driver_session_cookie(redirect, driver_id=driver.id)
    return redirect


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
async def driver_session_me(
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await _to_driver_session_out(
        db_session,
        driver_id=session.driver_id,
        name=session.name,
        can_sell_points=session.can_sell_points,
        can_self_assign=session.can_self_assign,
    )


async def _driver_recipient(
    db_session: AsyncSession,
    session: DriverSession,
    *,
    lang: str | None = None,
) -> InfoBlockRecipient:
    base = InfoBlockRecipient(
        pool=InfoBlockPool.DRIVER,
        recipient_type=InfoBlockReadRecipientType.DRIVER,
        recipient_id=session.driver_id,
    )
    language = (
        normalize_notification_language(lang)
        if lang
        else await resolve_recipient_language(db_session, recipient=base)
    )
    return InfoBlockRecipient(
        pool=InfoBlockPool.DRIVER,
        recipient_type=InfoBlockReadRecipientType.DRIVER,
        recipient_id=session.driver_id,
        language=language,
    )


@router.get("/notifications", response_model=NotificationPage)
async def list_driver_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unreadOnly: bool = False,
    lang: str | None = Query(default=None, max_length=8),
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    recipient = await _driver_recipient(db_session, session, lang=lang)
    items, total = await list_info_blocks_for_recipient(
        db_session,
        recipient=recipient,
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


@router.get("/notifications/unread-count", response_model=UnreadCountOut)
async def driver_unread_count(
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    recipient = await _driver_recipient(db_session, session)
    count = await count_unread_info_blocks(db_session, recipient=recipient)
    return UnreadCountOut(count=count)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_driver_notification_read(
    notification_id: str,
    lang: str | None = Query(default=None, max_length=8),
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    recipient = await _driver_recipient(db_session, session, lang=lang)
    view = await mark_info_block_read(
        db_session,
        info_block_id=notification_id,
        recipient=recipient,
    )
    if view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return info_block_to_notification_out(view)


@router.post("/notifications/read-all", response_model=UnreadCountOut)
async def mark_all_driver_notifications_read(
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    recipient = await _driver_recipient(db_session, session)
    await mark_all_info_blocks_read(db_session, recipient=recipient)
    return UnreadCountOut(count=0)


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
    session_out = await _to_driver_session_out(
        db_session,
        driver_id=session.driver_id,
        name=session.name,
        can_sell_points=session.can_sell_points,
        can_self_assign=session.can_self_assign,
    )
    sorted_rides = sorted(rides, key=lambda r: (r.route_order or 9999, r.created_at))
    ride_outs = [
        await _to_driver_ride_out(db_session, item, driver_id=session.driver_id)
        for item in sorted_rides
    ]
    return DriverCabinetOut(
        session=session_out,
        rides=ride_outs,
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


@router.get("/cabinet/map", response_model=DriverMapOut)
async def driver_cabinet_map(
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    rides, total = await list_driver_requests(
        db_session,
        driver_id=session.driver_id,
        limit=200,
        offset=0,
    )
    active_rides = [item for item in rides if item.status != "completed"]
    passenger_ids = list({item.passenger_id for item in rides})

    available_rides: list = []
    if session.can_self_assign:
        available_rides, _ = await list_unassigned_rides(
            db_session,
            limit=200,
            offset=0,
        )
        passenger_ids = list({item.passenger_id for item in rides + available_rides})

    username_by_user_id, passenger_rating_by_user_id = await _load_passenger_context(
        db_session,
        passenger_ids=passenger_ids,
    )

    driver = await get_driver(db_session, driver_id=session.driver_id)
    driver_lat = driver.current_lat if driver else None
    driver_lng = driver.current_lng if driver else None

    session_out = await _to_driver_session_out(
        db_session,
        driver_id=session.driver_id,
        name=session.name,
        can_sell_points=session.can_sell_points,
        can_self_assign=session.can_self_assign,
    )
    available_points: list[DriverMapPointOut] = []
    if session.can_self_assign:
        available_points = _build_driver_map_points(
            rides=available_rides,
            username_by_user_id=username_by_user_id,
            passenger_rating_by_user_id=passenger_rating_by_user_id,
            point_kind="available",
        )
    return DriverMapOut(
        session=session_out,
        points=_build_driver_map_points(
            rides=rides,
            username_by_user_id=username_by_user_id,
            passenger_rating_by_user_id=passenger_rating_by_user_id,
            driver_lat=driver_lat,
            driver_lng=driver_lng,
            point_kind="mine",
        ),
        availablePoints=available_points,
        activeRides=len(active_rides),
        totalRides=total,
    )


@router.post("/cabinet/rides/{request_id}/claim", response_model=DriverRideOut)
async def claim_cabinet_ride(
    request_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        ride = await claim_ride_by_driver(
            db_session,
            request_id=request_id,
            driver_id=session.driver_id,
            driver_can_self_assign=session.can_self_assign,
        )
    except ClaimRideError as exc:
        if exc.code == "forbidden":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.message) from exc
        if exc.code == "not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
        if exc.code == "already_assigned":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc

    driver = await get_driver(db_session, driver_id=session.driver_id)
    await notify_passenger_driver_assigned(request=ride, driver=driver)
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


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
    return await _to_driver_session_out(
        db_session,
        driver_id=updated.id,
        name=updated.name,
        can_sell_points=updated.can_sell_points,
        can_self_assign=updated.can_self_assign,
    )


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
    current_ride = await get_request(db_session, request_id=request_id)
    previous_status = current_ride.status if current_ride is not None else payload.status

    ride, error = await update_driver_ride_status(
        db_session,
        request_id=request_id,
        driver_id=session.driver_id,
        target_status=payload.status,
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")
    driver = await get_driver(db_session, driver_id=session.driver_id)
    await notify_passenger_status_changed(
        request=ride,
        previous_status=previous_status,
        driver=driver,
    )
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{request_id}/rate", response_model=DriverRideOut)
async def rate_ride_as_driver(
    request_id: str,
    payload: DriverRideRatingSubmitPayload,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        await submit_driver_rating(
            db_session,
            ride_id=request_id,
            driver_id=session.driver_id,
            score=payload.score,
            comment=payload.comment,
        )
    except RatingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    ride = await get_request(db_session, request_id=request_id)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


@router.patch("/cabinet/points/{request_id}/{point_type}/action", response_model=DriverRideOut)
async def update_cabinet_point_action(
    request_id: str,
    point_type: str,
    payload: DriverPointActionPayload,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    normalized_point_type = point_type.strip().lower()
    normalized_action = payload.action.strip().lower()
    if normalized_point_type not in {"pickup", "dropoff"}:
        raise HTTPException(status_code=400, detail="pointType должен быть pickup или dropoff.")
    if normalized_action not in {"start", "arrived", "complete"}:
        raise HTTPException(status_code=400, detail="action должен быть start, arrived или complete.")

    ride, previous_status, error = await apply_driver_point_action(
        db_session,
        request_id=request_id,
        driver_id=session.driver_id,
        point_type=normalized_point_type,
        action=normalized_action,
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")

    if previous_status is not None and previous_status != ride.status:
        driver = await get_driver(db_session, driver_id=session.driver_id)
        await notify_passenger_status_changed(
            request=ride,
            previous_status=previous_status,
            driver=driver,
        )
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


@router.patch("/cabinet/rides/{request_id}/pickup", response_model=DriverRideOut)
async def update_cabinet_ride_pickup(
    request_id: str,
    payload: DriverPickupUpdate,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    from app.services.ride_route_update_service import (
        PointUpdate,
        RouteChangeActor,
        apply_route_update_with_notifications,
    )

    ride, error = await apply_route_update_with_notifications(
        db_session,
        request_id=request_id,
        actor=RouteChangeActor.DRIVER,
        driver_id=session.driver_id,
        from_point=PointUpdate(
            address=payload.fromAddress,
            lat=payload.fromLat,
            lng=payload.fromLng,
        ),
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


@router.patch("/cabinet/rides/{request_id}/route", response_model=DriverRideOut)
async def update_cabinet_ride_route(
    request_id: str,
    payload: DriverRouteUpdate,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    from app.services.ride_route_update_service import PointUpdate, RouteChangeActor, apply_route_update_with_notifications

    if payload.fromPoint is None and payload.toPoint is None:
        raise HTTPException(status_code=400, detail="At least one route point is required.")
    from_point = (
        PointUpdate(
            address=payload.fromPoint.address,
            lat=payload.fromPoint.lat,
            lng=payload.fromPoint.lng,
        )
        if payload.fromPoint is not None
        else None
    )
    to_point = (
        PointUpdate(
            address=payload.toPoint.address,
            lat=payload.toPoint.lat,
            lng=payload.toPoint.lng,
        )
        if payload.toPoint is not None
        else None
    )
    ride, error = await apply_route_update_with_notifications(
        db_session,
        request_id=request_id,
        actor=RouteChangeActor.DRIVER,
        driver_id=session.driver_id,
        from_point=from_point,
        to_point=to_point,
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{request_id}/pickup/reset", response_model=DriverRideOut)
async def reset_cabinet_ride_pickup(
    request_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    ride, error = await reset_driver_pickup_point(
        db_session,
        request_id=request_id,
        driver_id=session.driver_id,
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)


@router.post("/cabinet/rides/{request_id}/notify-pickup-change", response_model=DriverRideOut)
async def notify_pickup_change(
    request_id: str,
    session: DriverSession = Depends(get_driver_session),
    db_session: AsyncSession = Depends(get_db_session),
):
    """Backward-compatible endpoint: notifications are sent automatically on route save."""
    ride = await get_request(db_session, request_id=request_id)
    if ride is None:
        raise HTTPException(status_code=404, detail="Поездка не найдена.")
    if ride.driver_id != session.driver_id:
        raise HTTPException(status_code=400, detail="Эта поездка не назначена вам.")
    if ride.pickup_changed_by_driver and ride.pickup_notified_at is None:
        from app.services.passenger_notification_service import notify_passenger_pickup_changed
        from app.services.ride_route_update_service import mark_driver_pickup_notified

        driver = await get_driver(db_session, driver_id=session.driver_id)
        await notify_passenger_pickup_changed(request=ride, driver=driver)
        await mark_driver_pickup_notified(db_session, request_id=request_id)
        ride = await get_request(db_session, request_id=request_id)
    return await _to_driver_ride_out(db_session, ride, driver_id=session.driver_id)
