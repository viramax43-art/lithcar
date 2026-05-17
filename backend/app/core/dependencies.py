"""
Модуль зависимостей для клиентов инфраструктуры.
Содержит только клиенты (HTTP, Redis, DB), бизнес-логика остаётся в сервисах.
"""
from typing import AsyncGenerator

import httpx
import redis.asyncio as redis
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def get_http_client(request: Request) -> httpx.AsyncClient:
    """
    Возвращает HTTP-клиент из состояния приложения.

    Args:
        request: Объект запроса FastAPI.

    Returns:
        Асинхронный HTTP-клиент.
    """
    return request.app.state.http_client


def get_redis_client(request: Request) -> redis.Redis:
    """
    Возвращает клиент Redis из состояния приложения.

    Args:
        request: Объект запроса FastAPI.

    Returns:
        Асинхронный клиент Redis.
    """
    return request.app.state.redis_client


async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """
    Создает и возвращает асинхронную сессию базы данных.

    Эта зависимость является генератором, который открывает сессию
    при вызове и автоматически закрывает ее после завершения запроса.

    Args:
        request: Объект запроса FastAPI.

    Yields:
        Асинхронная сессия SQLAlchemy.
    """
    session_factory: async_sessionmaker[AsyncSession] = request.app.state.db_session_factory
    async with session_factory() as session:
        yield session
