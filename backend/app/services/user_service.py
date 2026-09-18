from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.user import DEFAULT_USER_LANGUAGE, SUPPORTED_USER_LANGUAGES, User, UserRole


class UsernameConflictError(ValueError):
    """Raised when a Telegram username is already linked to another account."""


def _normalize_username(username: str | None) -> str | None:
    if username is None:
        return None
    normalized = str(username).strip()
    return normalized or None


async def find_user_by_username_insensitive(
    db_session: AsyncSession,
    username: str,
    *,
    exclude_user_id: str | None = None,
) -> User | None:
    normalized = _normalize_username(username)
    if not normalized:
        return None
    query = select(User).where(func.lower(User.username) == normalized.lower())
    if exclude_user_id:
        query = query.where(User.user_id != exclude_user_id)
    result = await db_session.execute(query)
    return result.scalar_one_or_none()


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
    username = _normalize_username(username)

    result = await db_session.execute(select(User).filter(User.user_id == user_id))
    user = result.scalar_one_or_none()

    candidate_language = preferred_language or language
    normalized_language = str(candidate_language).strip().lower() if candidate_language else None
    if normalized_language:
        normalized_language = normalized_language.split("-", 1)[0]
    if normalized_language not in SUPPORTED_USER_LANGUAGES:
        normalized_language = None

    if user:
        did_change = False
        if username and (user.username or "").lower() != username.lower():
            owner = await find_user_by_username_insensitive(
                db_session,
                username,
                exclude_user_id=user.user_id,
            )
            if owner is not None:
                raise UsernameConflictError(
                    f"Telegram username @{username} is already linked to another account."
                )
            user.username = username
            did_change = True
        if not user.language and normalized_language:
            user.language = normalized_language
            did_change = True
        if did_change:
            try:
                await db_session.commit()
                await db_session.refresh(user)
            except IntegrityError as exc:
                await db_session.rollback()
                raise UsernameConflictError(
                    f"Telegram username @{username} is already linked to another account."
                ) from exc
        return user

    if username:
        owner = await find_user_by_username_insensitive(db_session, username)
        if owner is not None:
            raise UsernameConflictError(
                f"Telegram username @{username} is already linked to another account."
            )

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
        await db_session.rollback()
        result = await db_session.execute(select(User).filter(User.user_id == user_id))
        user = result.scalar_one_or_none()
        if user is not None:
            did_change = False
            if username and (user.username or "").lower() != username.lower():
                owner = await find_user_by_username_insensitive(
                    db_session,
                    username,
                    exclude_user_id=user.user_id,
                )
                if owner is not None:
                    raise UsernameConflictError(
                        f"Telegram username @{username} is already linked to another account."
                    )
                user.username = username
                did_change = True
            if not user.language and normalized_language:
                user.language = normalized_language
                did_change = True
            if did_change:
                try:
                    await db_session.commit()
                    await db_session.refresh(user)
                except IntegrityError as exc:
                    await db_session.rollback()
                    raise UsernameConflictError(
                        f"Telegram username @{username} is already linked to another account."
                    ) from exc
            return user

        if username:
            owner = await find_user_by_username_insensitive(db_session, username)
            if owner is not None:
                raise UsernameConflictError(
                    f"Telegram username @{username} is already linked to another account."
                )

        db_session.add(new_user)
        try:
            await db_session.commit()
            await db_session.refresh(new_user)
            return new_user
        except IntegrityError as exc:
            await db_session.rollback()
            raise UsernameConflictError(
                f"Telegram username @{username} is already linked to another account."
            ) from exc


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
