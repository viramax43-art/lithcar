from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.driver import Driver
from app.models.ride_request import RideRequest, RideRequestStatus
from app.models.user import User, UserRole
from app.services.ride_request_service import assign_driver, update_driver_ride_status


def _ride(*, passenger_id: str, name: str, minute: int) -> RideRequest:
    return RideRequest(
        passenger_id=passenger_id,
        passenger_name=name,
        from_address=f"{name} pickup",
        from_lat=54.69,
        from_lng=25.27,
        to_address=f"{name} dropoff",
        to_lat=54.70,
        to_lng=25.28,
        date_time=datetime.now(timezone.utc) + timedelta(hours=2, minutes=minute),
        status=RideRequestStatus.PENDING,
    )


@pytest.mark.asyncio
async def test_passenger_number_is_assigned_once_and_survives_ride_stages(db_session):
    driver = Driver(
        name="Stable Number Driver",
        car_brand="Toyota",
        car_model="Prius",
        car_plate="NUM001",
        vehicle_color="White",
        seats_count=4,
        license_number="NUM-LIC",
        about="",
        rating=5.0,
        is_online=True,
    )
    passengers = [
        User(
            user_id=f"number-passenger-{index}",
            username=f"number_passenger_{index}",
            role=UserRole.PASSENGER,
            points_balance=100,
        )
        for index in range(1, 4)
    ]
    rides = [
        _ride(passenger_id=passenger.user_id, name=f"Passenger {index}", minute=index)
        for index, passenger in enumerate(passengers, start=1)
    ]
    db_session.add_all([driver, *passengers])
    await db_session.commit()
    db_session.add_all(rides)
    await db_session.commit()

    await assign_driver(
        db_session,
        request_ids=[rides[0].id],
        driver_id=driver.id,
    )
    await assign_driver(
        db_session,
        request_ids=[rides[1].id],
        driver_id=driver.id,
    )
    assert rides[0].passenger_number == 1
    assert rides[1].passenger_number == 2

    rides[0].passenger_number = 99
    with pytest.raises(DBAPIError):
        await db_session.commit()
    await db_session.rollback()
    await db_session.refresh(driver)
    await db_session.refresh(rides[0])
    await db_session.refresh(rides[1])
    await db_session.refresh(rides[2])
    assert rides[0].passenger_number == 1

    for target_status in (
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
        RideRequestStatus.IN_PROGRESS,
        RideRequestStatus.COMPLETED,
    ):
        updated, error = await update_driver_ride_status(
            db_session,
            request_id=rides[0].id,
            driver_id=driver.id,
            target_status=target_status,
        )
        assert error is None
        assert updated is not None
        assert updated.passenger_number == 1

    await assign_driver(
        db_session,
        request_ids=[rides[2].id],
        driver_id=driver.id,
    )
    await db_session.refresh(rides[1])
    assert rides[1].passenger_number == 2
    assert rides[2].passenger_number == 3

    for target_status in (
        RideRequestStatus.EN_ROUTE_TO_PICKUP,
        RideRequestStatus.AWAITING_PASSENGER,
        RideRequestStatus.IN_PROGRESS,
        RideRequestStatus.COMPLETED,
    ):
        updated, error = await update_driver_ride_status(
            db_session,
            request_id=rides[2].id,
            driver_id=driver.id,
            target_status=target_status,
        )
        assert error is None
        assert updated is not None
        assert updated.passenger_number == 3

    fourth_passenger = User(
        user_id="number-passenger-4",
        username="number_passenger_4",
        role=UserRole.PASSENGER,
        points_balance=100,
    )
    fourth_ride = _ride(
        passenger_id=fourth_passenger.user_id,
        name="Passenger 4",
        minute=4,
    )
    db_session.add(fourth_passenger)
    await db_session.commit()
    db_session.add(fourth_ride)
    await db_session.commit()
    await assign_driver(
        db_session,
        request_ids=[fourth_ride.id],
        driver_id=driver.id,
    )
    assert fourth_ride.passenger_number == 4


@pytest.mark.asyncio
async def test_bulk_assignment_preserves_approval_order(db_session):
    driver = Driver(
        name="Bulk Number Driver",
        car_brand="Toyota",
        car_model="Prius",
        car_plate="NUM002",
        vehicle_color="Black",
        seats_count=4,
        license_number="NUM-LIC-2",
        about="",
        rating=5.0,
        is_online=True,
    )
    passengers = [
        User(
            user_id=f"bulk-number-passenger-{index}",
            username=f"bulk_number_passenger_{index}",
            role=UserRole.PASSENGER,
            points_balance=100,
        )
        for index in range(1, 3)
    ]
    first = _ride(passenger_id=passengers[0].user_id, name="Bulk First", minute=1)
    second = _ride(passenger_id=passengers[1].user_id, name="Bulk Second", minute=2)
    db_session.add_all([driver, *passengers])
    await db_session.commit()
    db_session.add_all([first, second])
    await db_session.commit()

    await assign_driver(
        db_session,
        request_ids=[second.id, first.id],
        driver_id=driver.id,
    )

    assert second.passenger_number == 1
    assert first.passenger_number == 2


@pytest.mark.asyncio
async def test_parallel_approvals_get_distinct_passenger_numbers(db_session):
    driver = Driver(
        name="Concurrent Number Driver",
        car_brand="Toyota",
        car_model="Prius",
        car_plate="NUM003",
        vehicle_color="Silver",
        seats_count=4,
        license_number="NUM-LIC-3",
        about="",
        rating=5.0,
        is_online=True,
    )
    passengers = [
        User(
            user_id=f"parallel-number-passenger-{index}",
            username=f"parallel_number_passenger_{index}",
            role=UserRole.PASSENGER,
            points_balance=100,
        )
        for index in range(1, 3)
    ]
    rides = [
        _ride(passenger_id=passenger.user_id, name=f"Parallel {index}", minute=index)
        for index, passenger in enumerate(passengers, start=1)
    ]
    db_session.add_all([driver, *passengers])
    await db_session.commit()
    db_session.add_all(rides)
    await db_session.commit()

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def approve(request_id: str) -> None:
        async with session_factory() as session:
            await assign_driver(
                session,
                request_ids=[request_id],
                driver_id=driver.id,
            )

    try:
        await asyncio.gather(*(approve(ride.id) for ride in rides))
    finally:
        await engine.dispose()

    await db_session.refresh(rides[0])
    await db_session.refresh(rides[1])
    assert {ride.passenger_number for ride in rides} == {1, 2}
