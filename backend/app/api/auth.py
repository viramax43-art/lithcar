from __future__ import annotations

from datetime import datetime
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.models.ride_request import RideRequest
from app.models.user import User, UserRole
from app.services.auth_service import AuthService
from app.services.ride_request_service import list_passenger_requests

# --- Схемы (DTOs) ---

class InitData(BaseModel):
    initData: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserData(BaseModel):
    user_id: str
    username: str | None
    role: str
    created_at: datetime
    onboarding_completed: bool = False

    class Config:
        orm_mode = True


class RoleUpdate(BaseModel):
    role: str


class LatLng(BaseModel):
    lat: float
    lng: float


class RoutePoint(BaseModel):
    address: str
    latlng: LatLng


class RideHistoryItem(BaseModel):
    id: str
    fromPoint: RoutePoint
    toPoint: RoutePoint
    status: str
    dateTime: datetime
    createdAt: datetime


class UserCabinetData(BaseModel):
    userId: str
    username: str | None
    pointsBalance: int
    rideHistory: list[RideHistoryItem]
    rideHistoryTotal: int
    rideHistoryLimit: int
    rideHistoryOffset: int


# --- Настройка FastAPI ---

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth", auto_error=False)


# --- Зависимости ---

def get_auth_service(db: AsyncSession = Depends(get_db_session)) -> AuthService:
    return AuthService(db)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    auth_service: AuthService = Depends(get_auth_service)
) -> User:
    return await auth_service.get_user_from_token(token)


async def get_current_user_optional(
    token: str | None = Depends(optional_oauth2_scheme),
    auth_service: AuthService = Depends(get_auth_service),
) -> User | None:
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
async def login_for_access_token(
    data: InitData, auth_service: AuthService = Depends(get_auth_service)
):
    """
    Авторизация через Telegram InitData.
    """
    access_token = await auth_service.login_and_get_token(data.initData)
    return {"access_token": access_token}


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


def _to_ride_history_item(request: RideRequest) -> RideHistoryItem:
    return RideHistoryItem(
        id=request.id,
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
        createdAt=request.created_at,
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
    return UserCabinetData(
        userId=current_user.user_id,
        username=current_user.username,
        pointsBalance=current_user.points_balance,
        rideHistory=[_to_ride_history_item(item) for item in rides],
        rideHistoryTotal=total,
        rideHistoryLimit=limit,
        rideHistoryOffset=offset,
    )


