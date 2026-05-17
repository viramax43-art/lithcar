from __future__ import annotations

from aiogram.types import User as TgUser
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.user_service import get_or_create_user


async def get_or_create_passenger_from_telegram(
    db_session: AsyncSession,
    *,
    telegram_user: TgUser,
) -> User:
    username = telegram_user.username or telegram_user.full_name
    return await get_or_create_user(
        db_session,
        user_id=str(telegram_user.id),
        username=username,
    )
