from contextlib import asynccontextmanager, suppress
import asyncio
import logging
from fastapi import FastAPI
import httpx
import redis.asyncio as redis

from app.core.config import settings
from app.db import engine, async_session_factory
from app.services.admin_key_service import ensure_bootstrap_chief_admin_key
from app.services.storage_service import ensure_bucket_exists

logger = logging.getLogger(__name__)


async def _history_retention_loop(session_factory) -> None:
    from app.services.platform_settings_service import get_platform_config
    from app.services.ride_request_service import purge_completed_history

    while True:
        try:
            await asyncio.sleep(24 * 3600)
            async with session_factory() as session:
                cfg = await get_platform_config(session)
                days = int(cfg.get("system", {}).get("historyRetentionDays", 0) or 0)
                if days > 0:
                    deleted = await purge_completed_history(session, days=days)
                    if deleted:
                        logger.info("History retention: purged %s completed rides", deleted)
        except Exception:  # noqa: BLE001
            logger.exception("History retention purge failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Запуск контекстного менеджера")

    # 1. Создание клиента httpx
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        follow_redirects=True
    )

    # 2. Создание пула соединений Redis
    redis_client = redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True
    )

    # 3. Создание движка и фабрики сессий SQLAlchemy
    db_engine = engine
    db_session_factory = async_session_factory

    # Сохраняем клиенты в состояние приложения
    app.state.http_client = http_client
    app.state.redis_client = redis_client
    app.state.db_session_factory = db_session_factory

    async with db_session_factory() as session:
        await ensure_bootstrap_chief_admin_key(session)
    try:
        ensure_bucket_exists()
    except Exception as exc:  # noqa: BLE001
        if settings.s3_required_on_startup:
            raise
        logger.warning("S3 startup check skipped due to error: %s", exc)

    retention_task = asyncio.create_task(_history_retention_loop(db_session_factory))

    yield

    retention_task.cancel()
    with suppress(asyncio.CancelledError):
        await retention_task

    print("Приложение останавливается...")

    await app.state.http_client.aclose()
    await app.state.redis_client.aclose()
    await db_engine.dispose()


    print("Все контексты закрыты")
