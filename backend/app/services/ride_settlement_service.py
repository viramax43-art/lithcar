from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver import Driver
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.ride_payment_method import RidePaymentMethod
from app.models.ride_request import RideRequest
from app.models.user import User

logger = logging.getLogger(__name__)


@dataclass
class RideSettlementResult:
    """Итог финансового закрытия поездки.

    Баллы списываются при бронировании (эскроу). Поэтому отмена — это не «новый
    платёж», а распределение уже списанной суммы: возврат пассажиру + возможная
    компенсация водителю за потраченное время.
    """

    paid_points: int = 0
    passenger_refund: int = 0
    driver_compensation: int = 0
    already_settled: bool = False


def _clamp_percent(value: int | float) -> int:
    return max(0, min(100, int(value)))


async def settle_ride_cancellation(
    db_session: AsyncSession,
    *,
    ride: RideRequest,
    reason: str,
    refund_percent: int = 100,
    driver_compensation_percent: int = 0,
) -> RideSettlementResult:
    """Возврат баллов пассажиру и компенсация водителю при отмене/неявке.

    Идемпотентно: повторная отмена, повторный вызов сторожем или удаление заявки
    не создают вторую транзакцию возврата. Если поездка оплачивалась наличными
    водителю, возвращать нечего — сервис просто фиксирует причину расчёта.
    """
    ride.settlement_reason = reason

    if RidePaymentMethod.is_pay_driver_on_fact(ride.payment_method):
        return RideSettlementResult()

    debit_result = await db_session.execute(
        select(PointsTransaction)
        .where(
            PointsTransaction.user_id == ride.passenger_id,
            PointsTransaction.reference_id == ride.id,
            PointsTransaction.transaction_type == PointsTransactionType.RIDE_BOOKING_DEBIT,
        )
        .order_by(PointsTransaction.created_at.asc())
        .limit(1)
    )
    debit = debit_result.scalar_one_or_none()
    if debit is None:
        # Бесплатная поездка/старые данные: возвращать нечего.
        return RideSettlementResult()

    paid_points = abs(int(debit.amount or 0))
    if paid_points <= 0:
        return RideSettlementResult()

    if ride.refund_points is not None:
        # Расчёт уже выполнялся (в т.ч. с нулевым возвратом) — не дублируем.
        return RideSettlementResult(
            paid_points=paid_points,
            passenger_refund=int(ride.refund_points or 0),
            driver_compensation=int(ride.driver_compensation_points or 0),
            already_settled=True,
        )

    existing_result = await db_session.execute(
        select(PointsTransaction)
        .where(
            PointsTransaction.reference_id == ride.id,
            PointsTransaction.transaction_type == PointsTransactionType.RIDE_REFUND,
        )
        .limit(1)
    )
    if existing_result.scalar_one_or_none() is not None:
        return RideSettlementResult(
            paid_points=paid_points,
            passenger_refund=int(ride.refund_points or 0),
            driver_compensation=int(ride.driver_compensation_points or 0),
            already_settled=True,
        )

    refund_percent = _clamp_percent(refund_percent)
    compensation_percent = _clamp_percent(driver_compensation_percent)
    refund_points = int(round(paid_points * refund_percent / 100))
    compensation_points = int(round(paid_points * compensation_percent / 100))
    # Никогда не распределяем больше, чем было списано.
    if refund_points + compensation_points > paid_points:
        compensation_points = max(0, paid_points - refund_points)
    refund_points = max(0, min(paid_points, refund_points))

    if refund_points > 0:
        passenger = await db_session.get(User, ride.passenger_id)
        if passenger is not None:
            passenger.points_balance = int(passenger.points_balance or 0) + refund_points
            db_session.add(
                PointsTransaction(
                    user_id=passenger.user_id,
                    amount=refund_points,
                    transaction_type=PointsTransactionType.RIDE_REFUND,
                    reference_id=ride.id,
                    eur_amount_cents=(
                        int(round(int(debit.eur_amount_cents or 0) * refund_points / paid_points))
                        if debit.eur_amount_cents
                        else None
                    ),
                )
            )

    credited_compensation = 0
    if compensation_points > 0 and ride.driver_id:
        driver = await db_session.get(Driver, ride.driver_id)
        driver_user = await db_session.get(User, driver.user_id) if driver and driver.user_id else None
        if driver_user is not None:
            driver_user.points_balance = int(driver_user.points_balance or 0) + compensation_points
            credited_compensation = compensation_points
            db_session.add(
                PointsTransaction(
                    user_id=driver_user.user_id,
                    amount=compensation_points,
                    transaction_type=PointsTransactionType.RIDE_DRIVER_COMPENSATION,
                    reference_id=ride.id,
                    eur_amount_cents=(
                        int(round(int(debit.eur_amount_cents or 0) * compensation_points / paid_points))
                        if debit.eur_amount_cents
                        else None
                    ),
                )
            )
        else:
            logger.warning(
                "Ride %s: driver %s has no linked user, compensation %s points not credited",
                ride.id,
                ride.driver_id,
                compensation_points,
            )

    ride.refund_points = refund_points
    ride.driver_compensation_points = credited_compensation
    if refund_points > 0 or credited_compensation > 0:
        ride.refunded_at = datetime.now(timezone.utc)

    return RideSettlementResult(
        paid_points=paid_points,
        passenger_refund=refund_points,
        driver_compensation=credited_compensation,
    )


__all__ = ["RideSettlementResult", "settle_ride_cancellation"]
