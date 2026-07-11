from __future__ import annotations

from sqlalchemy import select

from app.core.security import create_access_token
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User, UserRole


async def _create_user(
    db_session,
    *,
    user_id: str,
    username: str | None = None,
    points_balance: int = 0,
):
    user = User(
        user_id=user_id,
        username=username,
        role=UserRole.PASSENGER,
        points_balance=points_balance,
    )
    db_session.add(user)
    await db_session.commit()
    return user


def _auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.user_id, role=user.role)}"}


async def test_transfer_points_success(client, db_session):
    sender = await _create_user(db_session, user_id="transfer-sender", username="sender", points_balance=100)
    recipient = await _create_user(db_session, user_id="transfer-recipient", username="recipient", points_balance=10)

    response = await client.post(
        "/api/points/transfer",
        json={"recipientUserId": recipient.user_id, "points": 30},
        headers=_auth_headers(sender),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["points"] == 30
    assert body["pointsBalance"] == 70
    assert body["recipientUserId"] == recipient.user_id
    assert body["recipientUsername"] == "recipient"

    await db_session.refresh(sender)
    await db_session.refresh(recipient)
    assert sender.points_balance == 70
    assert recipient.points_balance == 40

    tx_result = await db_session.execute(
        select(PointsTransaction).where(
            PointsTransaction.reference_id == body["transferId"],
        )
    )
    transactions = list(tx_result.scalars().all())
    assert len(transactions) == 2
    types = {tx.transaction_type for tx in transactions}
    assert types == {
        PointsTransactionType.USER_TRANSFER_OUT,
        PointsTransactionType.USER_TRANSFER_IN,
    }


async def test_transfer_points_recipient_not_found(client, db_session):
    sender = await _create_user(db_session, user_id="transfer-missing", points_balance=50)

    response = await client.post(
        "/api/points/transfer",
        json={"recipientUserId": "missing-user", "points": 10},
        headers=_auth_headers(sender),
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "recipient_not_found"


async def test_transfer_points_self_transfer_rejected(client, db_session):
    sender = await _create_user(db_session, user_id="transfer-self", points_balance=50)

    response = await client.post(
        "/api/points/transfer",
        json={"recipientUserId": sender.user_id, "points": 10},
        headers=_auth_headers(sender),
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "self_transfer"


async def test_transfer_points_insufficient_balance(client, db_session):
    sender = await _create_user(db_session, user_id="transfer-poor", points_balance=5)
    recipient = await _create_user(db_session, user_id="transfer-rich-target", points_balance=0)

    response = await client.post(
        "/api/points/transfer",
        json={"recipientUserId": recipient.user_id, "points": 10},
        headers=_auth_headers(sender),
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "insufficient_points"
    assert detail["requiredPoints"] == 10
    assert detail["currentBalance"] == 5

    await db_session.refresh(sender)
    await db_session.refresh(recipient)
    assert sender.points_balance == 5
    assert recipient.points_balance == 0
