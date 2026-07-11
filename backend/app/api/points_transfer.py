from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.dependencies import get_db_session
from app.models.user import User
from app.services.points_transfer_service import (
    InsufficientPointsTransferError,
    PointsTransferError,
    RecipientNotFoundError,
    SelfTransferError,
    transfer_points_between_users,
)


router = APIRouter(prefix="/points/transfer")


class PointsTransferPayload(BaseModel):
    recipientUserId: str = Field(min_length=1, max_length=64)
    points: int = Field(ge=1, le=10000)


class PointsTransferResult(BaseModel):
    success: bool
    transferId: str
    points: int
    pointsBalance: int
    recipientUserId: str
    recipientUsername: str | None


@router.post("", response_model=PointsTransferResult)
async def transfer_points(
    payload: PointsTransferPayload,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    try:
        result = await transfer_points_between_users(
            db_session,
            sender=current_user,
            recipient_user_id=payload.recipientUserId,
            points=payload.points,
        )
    except RecipientNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except SelfTransferError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except InsufficientPointsTransferError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": exc.code,
                "message": exc.message,
                "requiredPoints": exc.required_points,
                "currentBalance": exc.current_balance,
            },
        ) from exc
    except PointsTransferError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    return PointsTransferResult(
        success=True,
        transferId=result.transfer_id,
        points=result.points,
        pointsBalance=result.sender_balance_after,
        recipientUserId=result.recipient_user_id,
        recipientUsername=result.recipient_username,
    )
