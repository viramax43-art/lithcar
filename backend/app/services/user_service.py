from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError

from app.models.user import DEFAULT_USER_LANGUAGE, SUPPORTED_USER_LANGUAGES, User, UserRole


async def get_or_create_user(
    db_session: AsyncSession,
    *,
    user_id: str,
    username: str | None,
    language: str | None = None,
    preferred_language: str | None = None,
) -> User:
    """
    Получает пользователя по user_id или создает нового, если он не найден.
    """
    # Пытаемся найти пользователя в базе данных
    result = await db_session.execute(select(User).filter(User.user_id == user_id))
    user = result.scalar_one_or_none()

    candidate_language = preferred_language or language
    normalized_language = str(candidate_language).strip().lower() if candidate_language else None
    if normalized_language:
        normalized_language = normalized_language.split("-", 1)[0]
    if normalized_language not in SUPPORTED_USER_LANGUAGES:
        normalized_language = None

    if user:
        # Если пользователь найден, проверяем, изменился ли его username
        did_change = False
        if user.username != username:
            user.username = username
            did_change = True
        if not user.language and normalized_language:
            user.language = normalized_language
            did_change = True
        if did_change:
            await db_session.commit()
            await db_session.refresh(user)
        return user


async def get_user_by_id(db_session: AsyncSession, *, user_id: str) -> User | None:
    result = await db_session.execute(select(User).filter(User.user_id == user_id))
    return result.scalar_one_or_none()


async def update_user_language(
    db_session: AsyncSession,
    *,
    user: User,
    preferred_language: str,
) -> User:
    normalized_language = str(preferred_language).strip().lower()
    if normalized_language not in SUPPORTED_USER_LANGUAGES:
        normalized_language = DEFAULT_USER_LANGUAGE
    user.language = normalized_language
    await db_session.commit()
    await db_session.refresh(user)
    return user

    # Создаём нового пользователя; возможна гонка при параллельных логинах.
    new_user = User(
        user_id=str(user_id),
        username=username,
        role=UserRole.PASSENGER,
        language=normalized_language or DEFAULT_USER_LANGUAGE,
    )
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
        did_change = False
        if user.username != username:
            user.username = username
            did_change = True
        if not user.language and normalized_language:
            user.language = normalized_language
            did_change = True
        if did_change:
            await db_session.commit()
            await db_session.refresh(user)
        return user
