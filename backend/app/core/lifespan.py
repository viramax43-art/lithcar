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

    yield

    print("Приложение останавливается...")

    await app.state.http_client.aclose()
    await app.state.redis_client.aclose()
    await db_engine.dispose()


    print("Все контексты закрыты")
