from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api import (
    admin_audit,
    admin_keys,
    auth,
    driver_portal,
    driver_offers,
    driver_registration,
    drivers,
    group_suggestions,
    map_drawings,
    map_marks,
    notifications,
    points_card,
    points_qr,
    pricing,
    ride_quote,
    ride_offers,
    ride_requests,
    service_zones,
)
from app.core.lifespan import lifespan
from app.core.dependencies import get_db_session
from app.core.config import settings

fastapi_app = FastAPI(lifespan=lifespan)

app = fastapi_app

fastapi_app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


@api_router.get("/ping", tags=["Health Check"])
async def index(
    db_session: AsyncSession = Depends(get_db_session),
):
    """Проверка доступности PostgreSQL"""
    pg_pong_res = await db_session.execute(text("SELECT 1"))
    pg_pong = "ok" if pg_pong_res.scalar_one_or_none() == 1 else "error"
    return {"message": "pong", "postgres": pg_pong}


api_router.include_router(auth.router, tags=["Auth & Users"])
api_router.include_router(admin_keys.router, tags=["Admin Keys & Sessions"])
api_router.include_router(admin_audit.router, tags=["Admin Audit"])
api_router.include_router(ride_requests.router, tags=["Ride Requests"])
api_router.include_router(drivers.router, tags=["Drivers"])
api_router.include_router(driver_registration.router, tags=["Driver Registration"])
api_router.include_router(driver_portal.router, tags=["Driver Portal"])
api_router.include_router(driver_offers.router, tags=["Driver Offers"])
api_router.include_router(points_card.router, tags=["Points Card"])
api_router.include_router(points_qr.router, tags=["Points QR"])
api_router.include_router(service_zones.router, tags=["Service Zones"])
api_router.include_router(pricing.router, tags=["Pricing"])
api_router.include_router(ride_quote.router, tags=["Ride Quote"])
api_router.include_router(ride_offers.router, tags=["Ride Offers"])
api_router.include_router(group_suggestions.router, tags=["Group Suggestions"])
api_router.include_router(map_drawings.router, tags=["Map Drawings"])
api_router.include_router(map_marks.router, tags=["Map Marks"])
api_router.include_router(notifications.passenger_router, tags=["Notifications"])
api_router.include_router(notifications.admin_router, tags=["Admin Notifications"])
api_router.include_router(notifications.info_blocks_router, tags=["Admin Info Blocks"])
fastapi_app.include_router(api_router)

