import sys
import os
from pathlib import Path

# Добавляем корень backend в sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


_BASE_DIR = Path(__file__).resolve().parents[1]

_db_name = os.environ.get("POSTGRES_DB_TEST", "db_test")
_db_user = os.environ.get("POSTGRES_USER_TEST", "user_test")
_db_password = os.environ.get("POSTGRES_PASSWORD_TEST", "password_test")
_db_host = os.environ.get("TEST_DB_HOST", "postgres_test")
_db_port = os.environ.get("TEST_DB_PORT", "5432")

os.environ.setdefault(
    "DATABASE_URL",
    f"postgresql+asyncpg://{_db_user}:{_db_password}@{_db_host}:{_db_port}/{_db_name}",
)
os.environ.setdefault("REDIS_URL", "redis://redis_test:6379")
os.environ.setdefault("BOT_TOKEN", "test-bot-token")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "5")
os.environ.setdefault("CHIEF_ADMIN_KEY", "ride_chief_admin_test_bootstrap_key")
os.environ.setdefault("ALLOW_TEST_TELEGRAM_INIT_DATA", "true")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("S3_REQUIRED_ON_STARTUP", "false")


from app.core.config import settings
from app.models import Base


@pytest_asyncio.fixture(scope="session", autouse=True)
async def apply_migrations():
    alembic_ini = _BASE_DIR / "alembic.ini"
    config = Config(str(alembic_ini))
    command.upgrade(config, "head")
    yield


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    engine = create_async_engine(settings.database_url, echo=False)
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(
                text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE')
            )
    await engine.dispose()
    yield


@pytest_asyncio.fixture
async def client():
    from main import app as fastapi_app

    # Важно: при голом ASGITransport lifespan (startup/shutdown) может не запускаться,
    # из-за чего не инициализируются app.state.* зависимости (например db_session_factory).
    async with fastapi_app.router.lifespan_context(fastapi_app):
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
