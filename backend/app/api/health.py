from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session, get_redis_client

router = APIRouter()


@router.get("/health")
async def health_check(
    request: Request,
    db_session: AsyncSession = Depends(get_db_session),
):
    checks: dict[str, str] = {}
    http_status = 200

    try:
        result = await db_session.execute(text("SELECT 1"))
        checks["postgres"] = "ok" if result.scalar_one_or_none() == 1 else "fail"
        if checks["postgres"] != "ok":
            http_status = 503
    except Exception as exc:
        checks["postgres"] = f"fail: {exc}"
        http_status = 503

    try:
        redis_client = get_redis_client(request)
        pong = await redis_client.ping()
        checks["redis"] = "ok" if pong else "fail: no pong"
        if checks["redis"] != "ok":
            http_status = 503
    except Exception as exc:
        checks["redis"] = f"fail: {exc}"
        http_status = 503

    return JSONResponse(content=checks, status_code=http_status)
