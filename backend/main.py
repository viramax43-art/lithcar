from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
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
    health,
    map_drawings,
    map_marks,
    notifications,
    points_card,
    points_qr,
    points_transfer,
    pricing,
    push,
    ride_quote,
    ride_offers,
    ride_requests,
    service_zones,
)
from app.core.lifespan import lifespan
from app.core.dependencies import get_db_session
from app.core.config import settings
from app.core.limiter import limiter, rate_limit_exceeded_handler
from app.middleware.security_headers import SecurityHeadersMiddleware

_docs_enabled = not settings.is_production

fastapi_app = FastAPI(
    lifespan=lifespan,
    title="LithCar API",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app = fastapi_app
fastapi_app.state.limiter = limiter
fastapi_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
fastapi_app.add_middleware(SlowAPIMiddleware)
fastapi_app.add_middleware(SecurityHeadersMiddleware)

if settings.trusted_hosts_list:
    fastapi_app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts_list)

if not settings.frontend_cors_origins_list:
    raise RuntimeError("FRONTEND_CORS_ORIGINS must be set explicitly")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Idempotence-Key", "X-Content-HMAC-Signature"],
)


def _register_api_routes(api_router: APIRouter) -> None:
    @api_router.get("/ping", tags=["Health Check"])
    async def index(
        db_session: AsyncSession = Depends(get_db_session),
    ):
        pg_pong_res = await db_session.execute(text("SELECT 1"))
        pg_pong = "ok" if pg_pong_res.scalar_one_or_none() == 1 else "error"
        return {"message": "pong", "postgres": pg_pong}

    api_router.include_router(health.router, tags=["Health"])
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
    api_router.include_router(points_transfer.router, tags=["Points Transfer"])
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
    api_router.include_router(push.router, tags=["Push"])


api_v1_router = APIRouter(prefix="/api/v1")
_register_api_routes(api_v1_router)
fastapi_app.include_router(api_v1_router)

legacy_api_router = APIRouter(prefix="/api")
_register_api_routes(legacy_api_router)
fastapi_app.include_router(legacy_api_router)
