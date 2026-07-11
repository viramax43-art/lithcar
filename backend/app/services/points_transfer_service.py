from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User


class PointsTransferError(Exception):
    code: str = "transfer_failed"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class RecipientNotFoundError(PointsTransferError):
    code = "recipient_not_found"

    def __init__(self):
        super().__init__("Recipient user was not found.")
        self.message = "Recipient user was not found."


class SelfTransferError(PointsTransferError):
    code = "self_transfer"

    def __init__(self):
        super().__init__("Cannot transfer points to yourself.")
        self.message = "Cannot transfer points to yourself."


class InsufficientPointsTransferError(PointsTransferError):
    code = "insufficient_points"

    def __init__(self, *, required_points: int, current_balance: int):
        super().__init__("Insufficient points balance.")
        self.message = "Insufficient points balance."
        self.required_points = required_points
        self.current_balance = current_balance


@dataclass
class PointsTransferResult:
    transfer_id: str
    points: int
    sender_balance_after: int
    recipient_user_id: str
    recipient_username: str | None


async def _lock_users_by_id(
    db_session: AsyncSession,
    user_id_a: str,
    user_id_b: str,
) -> dict[str, User]:
    ordered_ids = sorted({user_id_a, user_id_b})
    result = await db_session.execute(
        select(User)
        .where(User.user_id.in_(ordered_ids))
        .order_by(User.user_id)
        .with_for_update()
    )
    return {user.user_id: user for user in result.scalars().all()}


async def transfer_points_between_users(
    db_session: AsyncSession,
    *,
    sender: User,
    recipient_user_id: str,
    points: int,
) -> PointsTransferResult:
    recipient_id = recipient_user_id.strip()
    if recipient_id == sender.user_id:
        raise SelfTransferError()

    transfer_id = str(uuid4())

    try:
        locked_users = await _lock_users_by_id(db_session, sender.user_id, recipient_id)
        sender_row = locked_users.get(sender.user_id)
        recipient_row = locked_users.get(recipient_id)
        if recipient_row is None:
            raise RecipientNotFoundError()

        sender_balance = int(sender_row.points_balance or 0)
        if sender_balance < points:
            raise InsufficientPointsTransferError(
                required_points=points,
                current_balance=sender_balance,
            )

        sender_row.points_balance = sender_balance - points
        recipient_row.points_balance = int(recipient_row.points_balance or 0) + points

        db_session.add(
            PointsTransaction(
                id=str(uuid4()),
                user_id=sender_row.user_id,
                amount=-points,
                transaction_type=PointsTransactionType.USER_TRANSFER_OUT,
                reference_id=transfer_id,
            )
        )
        db_session.add(
            PointsTransaction(
                id=str(uuid4()),
                user_id=recipient_row.user_id,
                amount=points,
                transaction_type=PointsTransactionType.USER_TRANSFER_IN,
                reference_id=transfer_id,
            )
        )
        await db_session.commit()
    except PointsTransferError:
        await db_session.rollback()
        raise
    except Exception:
        await db_session.rollback()
        raise

    await db_session.refresh(sender_row)
    return PointsTransferResult(
        transfer_id=transfer_id,
        points=points,
        sender_balance_after=int(sender_row.points_balance or 0),
        recipient_user_id=recipient_row.user_id,
        recipient_username=recipient_row.username,
    )
