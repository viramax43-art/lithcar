from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings

# Инициализация асинхронного движка и фабрики сессий SQLAlchemy.
engine = create_async_engine(settings.database_url, echo=False)
async_session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
