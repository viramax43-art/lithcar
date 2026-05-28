from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver import Driver
from app.models.ride_rating import RaterRole, RideRating
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User

DEFAULT_RATING = 5.0
MAX_COMMENT_LENGTH = 500


class RatingError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class RideRatingContext:
    can_rate: bool
    my_score: int | None
    my_comment: str | None


@dataclass(frozen=True)
class RatingAggregate:
    rating: float
    rating_count: int


def _normalize_comment(comment: str | None) -> str | None:
    if comment is None:
        return None
    trimmed = comment.strip()
    if not trimmed:
        return None
    if len(trimmed) > MAX_COMMENT_LENGTH:
        raise RatingError(
            f"Комментарий не может быть длиннее {MAX_COMMENT_LENGTH} символов.",
            status_code=400,
        )
    return trimmed


def _validate_score(score: int) -> None:
    if score < 1 or score > 5:
        raise RatingError("Оценка должна быть от 1 до 5.", status_code=400)


async def _get_existing_rating(
    db_session: AsyncSession,
    *,
    ride_request_id: str,
    rater_role: str,
) -> RideRating | None:
    result = await db_session.execute(
        select(RideRating).where(
            RideRating.ride_request_id == ride_request_id,
            RideRating.rater_role == rater_role,
        )
    )
    return result.scalar_one_or_none()


async def _ensure_can_rate(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    rater_role: str,
) -> None:
    if ride.status != RideRequestStatus.COMPLETED:
        raise RatingError("Оценить можно только завершённую поездку.", status_code=400)
    if ride.driver_id is None:
        raise RatingError("Поездка без назначенного водителя.", status_code=400)

    existing = await _get_existing_rating(
        db_session,
        ride_request_id=ride.id,
        rater_role=rater_role,
    )
    if existing is not None:
        raise RatingError("Оценка по этой поездке уже отправлена.", status_code=409)


async def recalculate_driver_rating(db_session: AsyncSession, driver_id: str) -> RatingAggregate:
    stmt = (
        select(func.avg(RideRating.score), func.count(RideRating.id))
        .join(RideRequest, RideRequest.id == RideRating.ride_request_id)
        .where(
            RideRating.rater_role == RaterRole.PASSENGER,
            RideRequest.driver_id == driver_id,
        )
    )
    result = await db_session.execute(stmt)
    avg_score, count = result.one()
    rating_count = int(count or 0)
    rating = round(float(avg_score), 1) if rating_count > 0 else DEFAULT_RATING

    driver = await db_session.get(Driver, driver_id)
    if driver is not None:
        driver.rating = rating

    return RatingAggregate(rating=rating, rating_count=rating_count)


async def recalculate_user_rating(db_session: AsyncSession, user_id: str) -> RatingAggregate:
    stmt = (
        select(func.avg(RideRating.score), func.count(RideRating.id))
        .join(RideRequest, RideRequest.id == RideRating.ride_request_id)
        .where(
            RideRating.rater_role == RaterRole.DRIVER,
            RideRequest.passenger_id == user_id,
        )
    )
    result = await db_session.execute(stmt)
    avg_score, count = result.one()
    rating_count = int(count or 0)
    rating = round(float(avg_score), 1) if rating_count > 0 else DEFAULT_RATING

    user = await db_session.get(User, user_id)
    if user is not None:
        user.rating = rating

    return RatingAggregate(rating=rating, rating_count=rating_count)


async def get_driver_rating_aggregate(
    db_session: AsyncSession,
    driver_id: str,
) -> RatingAggregate:
    stmt = (
        select(func.count(RideRating.id))
        .join(RideRequest, RideRequest.id == RideRating.ride_request_id)
        .where(
            RideRating.rater_role == RaterRole.PASSENGER,
            RideRequest.driver_id == driver_id,
        )
    )
    result = await db_session.execute(stmt)
    rating_count = int(result.scalar_one() or 0)
    driver = await db_session.get(Driver, driver_id)
    rating = float(driver.rating) if driver is not None else DEFAULT_RATING
    return RatingAggregate(rating=rating, rating_count=rating_count)


async def get_user_rating_aggregate(
    db_session: AsyncSession,
    user_id: str,
) -> RatingAggregate:
    stmt = (
        select(func.count(RideRating.id))
        .join(RideRequest, RideRequest.id == RideRating.ride_request_id)
        .where(
            RideRating.rater_role == RaterRole.DRIVER,
            RideRequest.passenger_id == user_id,
        )
    )
    result = await db_session.execute(stmt)
    rating_count = int(result.scalar_one() or 0)
    user = await db_session.get(User, user_id)
    rating = float(user.rating) if user is not None else DEFAULT_RATING
    return RatingAggregate(rating=rating, rating_count=rating_count)


async def get_passenger_rating_for_ride(
    db_session: AsyncSession,
    *,
    passenger_id: str,
) -> RatingAggregate:
    return await get_user_rating_aggregate(db_session, passenger_id)


async def submit_passenger_rating(
    db_session: AsyncSession,
    *,
    ride_id: str,
    passenger_id: str,
    score: int,
    comment: str | None = None,
) -> RideRating:
    _validate_score(score)
    normalized_comment = _normalize_comment(comment)

    ride = await db_session.get(RideRequest, ride_id)
    if ride is None:
        raise RatingError("Поездка не найдена.", status_code=404)
    if ride.passenger_id != passenger_id:
        raise RatingError("Нет доступа к этой поездке.", status_code=403)

    await _ensure_can_rate(db_session, ride=ride, rater_role=RaterRole.PASSENGER)

    rating = RideRating(
        ride_request_id=ride.id,
        rater_role=RaterRole.PASSENGER,
        score=score,
        comment=normalized_comment,
    )
    db_session.add(rating)
    await db_session.flush()

    if ride.driver_id:
        await recalculate_driver_rating(db_session, ride.driver_id)

    await db_session.commit()
    await db_session.refresh(rating)
    return rating


async def submit_driver_rating(
    db_session: AsyncSession,
    *,
    ride_id: str,
    driver_id: str,
    score: int,
    comment: str | None = None,
) -> RideRating:
    _validate_score(score)
    normalized_comment = _normalize_comment(comment)

    ride = await db_session.get(RideRequest, ride_id)
    if ride is None:
        raise RatingError("Поездка не найдена.", status_code=404)
    if ride.driver_id != driver_id:
        raise RatingError("Нет доступа к этой поездке.", status_code=403)

    await _ensure_can_rate(db_session, ride=ride, rater_role=RaterRole.DRIVER)

    rating = RideRating(
        ride_request_id=ride.id,
        rater_role=RaterRole.DRIVER,
        score=score,
        comment=normalized_comment,
    )
    db_session.add(rating)
    await db_session.flush()

    await recalculate_user_rating(db_session, ride.passenger_id)

    await db_session.commit()
    await db_session.refresh(rating)
    return rating


async def get_ride_rating_context_for_passenger(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    passenger_id: str,
) -> RideRatingContext:
    if ride.passenger_id != passenger_id:
        return RideRatingContext(can_rate=False, my_score=None, my_comment=None)

    existing = await _get_existing_rating(
        db_session,
        ride_request_id=ride.id,
        rater_role=RaterRole.PASSENGER,
    )
    can_rate = (
        ride.status == RideRequestStatus.COMPLETED
        and ride.driver_id is not None
        and existing is None
    )
    return RideRatingContext(
        can_rate=can_rate,
        my_score=existing.score if existing else None,
        my_comment=existing.comment if existing else None,
    )


async def can_passenger_rate_driver(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    passenger_id: str,
) -> bool:
    ctx = await get_ride_rating_context_for_passenger(
        db_session,
        ride=ride,
        passenger_id=passenger_id,
    )
    return ctx.can_rate


async def get_ride_rating_context_for_driver(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    driver_id: str,
) -> RideRatingContext:
    if ride.driver_id != driver_id:
        return RideRatingContext(can_rate=False, my_score=None, my_comment=None)

    existing = await _get_existing_rating(
        db_session,
        ride_request_id=ride.id,
        rater_role=RaterRole.DRIVER,
    )
    can_rate = (
        ride.status == RideRequestStatus.COMPLETED
        and existing is None
    )
    return RideRatingContext(
        can_rate=can_rate,
        my_score=existing.score if existing else None,
        my_comment=existing.comment if existing else None,
    )
