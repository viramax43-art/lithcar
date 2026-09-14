from __future__ import annotations

from datetime import datetime
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_timezone import to_app_local_iso
from app.core.auth_cookies import clear_passenger_auth_cookies, set_passenger_auth_cookies
from app.core.config import settings
from app.core.dependencies import get_db_session
from app.core.limiter import limiter
from app.models.ride_request import RideRequest
from app.models.user import DEFAULT_USER_LANGUAGE, User, UserRole
from app.services.auth_service import AuthService
from app.services.block_service import BlockError, block_user, list_blocked_users, unblock_user
from app.services.rating_service import can_passenger_rate_driver, get_user_rating_aggregate
from app.services.ride_request_service import list_passenger_requests

# --- Схемы (DTOs) ---

class InitData(BaseModel):
    initData: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshResult(BaseModel):
    ok: bool = True

class UserData(BaseModel):
    user_id: str
    username: str | None
    role: str
    language: str = DEFAULT_USER_LANGUAGE
    created_at: datetime
    onboarding_completed: bool = False

    class Config:
        orm_mode = True


class RoleUpdate(BaseModel):
    role: str


class LanguageUpdate(BaseModel):
    language: str


class LatLng(BaseModel):
    lat: float
    lng: float


class RoutePoint(BaseModel):
    address: str
    latlng: LatLng


class RideHistoryItem(BaseModel):
    id: str
    rideNumber: int
    fromPoint: RoutePoint
    toPoint: RoutePoint
    status: str
    dateTime: datetime
    dateTimeLocal: str
    createdAt: datetime
    canRateDriver: bool = False


class UserCabinetData(BaseModel):
    userId: str
    username: str | None
    pointsBalance: int
    rating: float
    ratingCount: int
    rideHistory: list[RideHistoryItem]
    rideHistoryTotal: int
    rideHistoryLimit: int
    rideHistoryOffset: int


class BlockUserPayload(BaseModel):
    userId: str


class BlockedUserOut(BaseModel):
    userId: str
    username: str | None
    displayName: str
    blockedAt: datetime
    blockedAtLocal: str


class BlockedUserPage(BaseModel):
    items: list[BlockedUserOut]
    total: int


def _block_error_to_http(exc: BlockError) -> HTTPException:
    if exc.code == "self_block":
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        )
    if exc.code in ("user_not_found", "not_blocked"):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": exc.code, "message": exc.message},
        )
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)


# --- Настройка FastAPI ---

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth", auto_error=False)


# --- Зависимости ---

def get_auth_service(db: AsyncSession = Depends(get_db_session)) -> AuthService:
    return AuthService(db)

async def resolve_access_token(
    request: Request,
    bearer_token: str | None = Depends(optional_oauth2_scheme),
) -> str:
    cookie_token = request.cookies.get(settings.passenger_access_cookie_name)
    if cookie_token:
        return cookie_token
    if bearer_token:
        return bearer_token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    token: str = Depends(resolve_access_token),
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    return await auth_service.get_user_from_token(token)


async def get_current_user_optional(
    request: Request,
    bearer_token: str | None = Depends(optional_oauth2_scheme),
    auth_service: AuthService = Depends(get_auth_service),
) -> User | None:
    token = request.cookies.get(settings.passenger_access_cookie_name) or bearer_token
    if not token:
        return None
    try:
        return await auth_service.get_user_from_token(token)
    except HTTPException:
        return None


def require_roles(*allowed_roles: str) -> Callable[[User], User]:
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        normalized = current_user.role.strip().lower()
        if normalized not in {role.lower() for role in allowed_roles}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions.",
            )
        return current_user
    return dependency


# --- Роуты ---

@router.post("/auth", response_model=Token)
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    data: InitData,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    """
    Авторизация через Telegram InitData.
    """
    access_token, refresh_token = await auth_service.issue_token_pair(data.initData)
    set_passenger_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
    return {"access_token": access_token}


@router.post("/auth/refresh", response_model=RefreshResult)
@limiter.limit("10/minute")
async def refresh_access_token(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    refresh_token = request.cookies.get(settings.passenger_refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    access_token, new_refresh = await auth_service.refresh_access_token(refresh_token)
    set_passenger_auth_cookies(response, access_token=access_token, refresh_token=new_refresh)
    return RefreshResult()


@router.post("/auth/logout", response_model=RefreshResult)
async def logout_passenger(response: Response):
    clear_passenger_auth_cookies(response)
    return RefreshResult()


@router.get("/users/me", response_model=UserData)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Возвращает информацию о текущем авторизованном пользователе.
    """
    return current_user


@router.post("/users/me/complete-onboarding")
async def complete_onboarding(
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Помечает onboarding как завершенный для текущего пользователя.
    """
    await auth_service.mark_onboarding_completed(current_user)
    return {"success": True}


@router.patch("/users/me/role", response_model=UserData)
async def update_current_user_role(
    payload: RoleUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MODERATOR)),
    auth_service: AuthService = Depends(get_auth_service),
):
    user = await auth_service.set_user_role(current_user, payload.role)
    return user


@router.patch("/users/me/language", response_model=UserData)
async def update_current_user_language(
    payload: LanguageUpdate,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
):
    user = await auth_service.set_user_language(current_user, payload.language)
    return user


async def _to_ride_history_item(
    db_session: AsyncSession,
    request: RideRequest,
    *,
    passenger_id: str,
) -> RideHistoryItem:
    can_rate = await can_passenger_rate_driver(
        db_session,
        ride=request,
        passenger_id=passenger_id,
    )
    return RideHistoryItem(
        id=request.id,
        rideNumber=request.ride_number,
        fromPoint=RoutePoint(
            address=request.from_address,
            latlng=LatLng(lat=request.from_lat, lng=request.from_lng),
        ),
        toPoint=RoutePoint(
            address=request.to_address,
            latlng=LatLng(lat=request.to_lat, lng=request.to_lng),
        ),
        status=request.status,
        dateTime=request.date_time,
        dateTimeLocal=to_app_local_iso(request.date_time),
        createdAt=request.created_at,
        canRateDriver=can_rate,
    )


@router.get("/users/me/cabinet", response_model=UserCabinetData)
async def get_user_cabinet(
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db_session: AsyncSession = Depends(get_db_session),
):
    rides, total = await list_passenger_requests(
        db_session,
        passenger_id=current_user.user_id,
        limit=limit,
        offset=offset,
    )
    rating_aggregate = await get_user_rating_aggregate(db_session, current_user.user_id)
    history = [
        await _to_ride_history_item(db_session, item, passenger_id=current_user.user_id)
        for item in rides
    ]
    return UserCabinetData(
        userId=current_user.user_id,
        username=current_user.username,
        pointsBalance=current_user.points_balance,
        rating=rating_aggregate.rating,
        ratingCount=rating_aggregate.rating_count,
        rideHistory=history,
        rideHistoryTotal=total,
        rideHistoryLimit=limit,
        rideHistoryOffset=offset,
    )


@router.post("/users/me/blocks")
async def create_user_block(
    payload: BlockUserPayload,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        await block_user(
            db_session,
            blocker_id=current_user.user_id,
            blocked_id=payload.userId,
        )
    except BlockError as exc:
        raise _block_error_to_http(exc) from exc
    return {"success": True}


@router.delete("/users/me/blocks/{user_id}")
async def delete_user_block(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        await unblock_user(
            db_session,
            blocker_id=current_user.user_id,
            blocked_id=user_id,
        )
    except BlockError as exc:
        raise _block_error_to_http(exc) from exc
    return {"success": True}


@router.get("/users/me/blocks", response_model=BlockedUserPage)
async def get_user_blocks(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    rows = await list_blocked_users(db_session, blocker_id=current_user.user_id)
    items = [
        BlockedUserOut(
            userId=row.user_id,
            username=row.username,
            displayName=row.display_name,
            blockedAt=row.blocked_at,
            blockedAtLocal=to_app_local_iso(row.blocked_at),
        )
        for row in rows
    ]
    return BlockedUserPage(items=items, total=len(items))

