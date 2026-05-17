from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserRole


async def get_or_create_user(
    db_session: AsyncSession, *, user_id: str, username: str | None
) -> User:
    """
    Получает пользователя по user_id или создает нового, если он не найден.
    """
    # Пытаемся найти пользователя в базе данных
    result = await db_session.execute(select(User).filter(User.user_id == user_id))
    user = result.scalar_one_or_none()

    if user:
        # Если пользователь найден, проверяем, изменился ли его username
        if user.username != username:
            user.username = username
            await db_session.commit()
            await db_session.refresh(user)
        return user

    # Создаём нового пользователя; возможна гонка при параллельных логинах.
    new_user = User(user_id=str(user_id), username=username, role=UserRole.PASSENGER)
    db_session.add(new_user)
    
    try:
        await db_session.commit()
        await db_session.refresh(new_user)
        return new_user
    except IntegrityError:
        # Параллельная вставка могла произойти — откатываем и читаем существующего
        await db_session.rollback()
        result = await db_session.execute(select(User).filter(User.user_id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            # Нечего возвращать — пробуем ещё раз создать (редкий случай)
            db_session.add(new_user)
            await db_session.commit()
            await db_session.refresh(new_user)
            return new_user
        # Обновим username при необходимости
        if user.username != username:
            user.username = username
            await db_session.commit()
            await db_session.refresh(user)
        return user
