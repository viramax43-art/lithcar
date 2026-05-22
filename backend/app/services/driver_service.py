from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_driver_key, hash_admin_key
from app.models.driver import Driver
from app.models.ride_request import RideRequest
from app.models.user import User, UserRole


def online_cutoff(online_timeout_seconds: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(seconds=max(1, online_timeout_seconds))


def is_driver_online(driver: Driver, *, online_timeout_seconds: int) -> bool:
    if not driver.is_online or driver.last_seen_at is None:
        return False
    return driver.last_seen_at >= online_cutoff(online_timeout_seconds)


async def create_driver(
    db_session: AsyncSession,
    *,
    user_id: str | None,
    name: str,
    photo_url: str | None,
    car_brand: str,
    car_model: str,
    car_plate: str,
    vehicle_color: str,
    seats_count: int,
    license_number: str,
    about: str,
    rating: float = 5.0,
    is_online: bool = False,
    can_sell_points: bool = False,
) -> Driver:
    normalized_user_id = (user_id or "").strip() or None
    if normalized_user_id:
        user = await db_session.get(User, normalized_user_id)
        if user is None:
            user = User(
                user_id=normalized_user_id,
                username=name.strip() or normalized_user_id,
                role=UserRole.DRIVER,
            )
            db_session.add(user)
        else:
            user.role = UserRole.DRIVER

    raw_key = generate_driver_key()
    driver = Driver(
        user_id=normalized_user_id,
        name=name,
        photo_url=photo_url,
        car_brand=car_brand,
        car_model=car_model,
        car_plate=car_plate,
        vehicle_color=vehicle_color,
        seats_count=seats_count,
        license_number=license_number,
        about=about,
        access_key_hash=hash_admin_key(raw_key),
        key_prefix=raw_key[:20],
        rating=rating,
        is_online=is_online,
        last_seen_at=datetime.now(timezone.utc) if is_online else None,
        can_sell_points=can_sell_points,
    )
    db_session.add(driver)
    await db_session.commit()
    await db_session.refresh(driver)
    driver._raw_key = raw_key  # transient value for API response
    return driver


async def list_drivers(
    db_session: AsyncSession,
    *,
    online_only: bool = False,
    online_timeout_seconds: int = 60,
    limit: int,
    offset: int,
) -> tuple[list[Driver], int]:
    stmt = select(Driver).order_by(Driver.created_at.desc()).limit(limit).offset(offset)
    total_stmt = select(func.count()).select_from(Driver)
    if online_only:
        cutoff = online_cutoff(online_timeout_seconds)
        online_filter = Driver.is_online.is_(True) & Driver.last_seen_at.is_not(None) & (Driver.last_seen_at >= cutoff)
        stmt = stmt.where(online_filter)
        total_stmt = total_stmt.where(online_filter)
    total_query = await db_session.execute(total_stmt)
    total = int(total_query.scalar_one() or 0)
    result = await db_session.execute(stmt)
    return list(result.scalars().all()), total


async def get_driver(db_session: AsyncSession, *, driver_id: str) -> Driver | None:
    return await db_session.get(Driver, driver_id)


async def get_driver_by_user_id(db_session: AsyncSession, *, user_id: str) -> Driver | None:
    result = await db_session.execute(select(Driver).where(Driver.user_id == user_id))
    return result.scalar_one_or_none()


async def get_driver_by_raw_key(db_session: AsyncSession, *, raw_key: str) -> Driver | None:
    hashed = hash_admin_key(raw_key)
    result = await db_session.execute(select(Driver).where(Driver.access_key_hash == hashed))
    return result.scalar_one_or_none()


async def update_driver_location(
    db_session: AsyncSession,
    *,
    driver_id: str,
    lat: float,
    lng: float,
) -> Driver | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    driver.current_lat = lat
    driver.current_lng = lng
    await db_session.commit()
    await db_session.refresh(driver)
    return driver


async def update_driver_online(
    db_session: AsyncSession,
    *,
    driver_id: str,
    is_online: bool,
) -> Driver | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    driver.is_online = is_online
    driver.last_seen_at = datetime.now(timezone.utc) if is_online else None
    await db_session.commit()
    await db_session.refresh(driver)
    return driver


async def touch_driver_online(
    db_session: AsyncSession,
    *,
    driver_id: str,
) -> Driver | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    driver.is_online = True
    driver.last_seen_at = datetime.now(timezone.utc)
    await db_session.commit()
    await db_session.refresh(driver)
    return driver


async def rotate_driver_key(db_session: AsyncSession, *, driver_id: str) -> tuple[Driver, str] | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    plaintext = generate_driver_key()
    driver.access_key_hash = hash_admin_key(plaintext)
    driver.key_prefix = plaintext[:20]
    await db_session.commit()
    await db_session.refresh(driver)
    return driver, plaintext


async def update_driver_profile(
    db_session: AsyncSession,
    *,
    driver_id: str,
    name: str | None = None,
    photo_url: str | None = None,
    car_brand: str | None = None,
    car_model: str | None = None,
    car_plate: str | None = None,
    vehicle_color: str | None = None,
    seats_count: int | None = None,
    about: str | None = None,
    rating: float | None = None,
    is_online: bool | None = None,
    can_sell_points: bool | None = None,
) -> Driver | None:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return None
    if name is not None:
        driver.name = name
    if photo_url is not None:
        driver.photo_url = photo_url
    if car_brand is not None:
        driver.car_brand = car_brand
    if car_model is not None:
        driver.car_model = car_model
    if car_plate is not None:
        driver.car_plate = car_plate
    if vehicle_color is not None:
        driver.vehicle_color = vehicle_color
    if seats_count is not None:
        driver.seats_count = seats_count
    if about is not None:
        driver.about = about
    if rating is not None:
        driver.rating = rating
    if is_online is not None:
        driver.is_online = is_online
        driver.last_seen_at = datetime.now(timezone.utc) if is_online else None
    if can_sell_points is not None:
        driver.can_sell_points = can_sell_points
    await db_session.commit()
    await db_session.refresh(driver)
    return driver


async def delete_driver(db_session: AsyncSession, *, driver_id: str) -> bool:
    driver = await get_driver(db_session, driver_id=driver_id)
    if driver is None:
        return False
    if driver.user_id:
        user = await db_session.get(User, driver.user_id)
        if user is not None:
            user.role = UserRole.PASSENGER
    await db_session.execute(
        update(RideRequest).where(RideRequest.driver_id == driver_id).values(driver_id=None)
    )
    await db_session.delete(driver)
    await db_session.commit()
    return True
