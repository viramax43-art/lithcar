from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, Field

from app.api.auth import get_current_user
from app.core.dependencies import get_redis_client
from app.models.user import User

router = APIRouter(prefix="/push")


class PushTokenPayload(BaseModel):
    token: str = Field(min_length=10, max_length=512)


@router.post("/register")
async def register_push_token(
    request: Request,
    payload: PushTokenPayload,
    current_user: User = Depends(get_current_user),
):
    redis_client = get_redis_client(request)
    key = f"push:token:{current_user.user_id}"
    await redis_client.set(key, payload.token.strip())
    return {"ok": True}
