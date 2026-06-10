from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: str
    pool: str
    type: str
    title: str
    body: str
    payload: dict[str, Any] | None = None
    readAt: datetime | None = None
    createdAt: datetime


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    limit: int
    offset: int


class UnreadCountOut(BaseModel):
    count: int


class InfoBlockOut(BaseModel):
    id: str
    pool: str
    title: str
    body: str
    audience: Literal["all", "user"] = "all"
    targetUsername: str | None = None
    isActive: bool
    sortOrder: int
    createdAt: datetime
    updatedAt: datetime


class InfoBlockPage(BaseModel):
    items: list[InfoBlockOut]
    total: int


class CreateInfoBlockIn(BaseModel):
    pool: Literal["passenger", "driver"]
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    audience: Literal["all", "user"] = "all"
    targetUsername: str | None = Field(default=None, max_length=64)


class UpdateInfoBlockIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    isActive: bool | None = None


def notification_to_out(entity) -> NotificationOut:
    return NotificationOut(
        id=entity.id,
        pool=entity.pool,
        type=entity.type,
        title=entity.title,
        body=entity.body,
        payload=entity.payload,
        readAt=entity.read_at,
        createdAt=entity.created_at,
    )


def info_block_to_out(entity) -> InfoBlockOut:
    return InfoBlockOut(
        id=entity.id,
        pool=entity.pool,
        title=entity.title,
        body=entity.body,
        audience=entity.audience or "all",
        targetUsername=entity.target_username,
        isActive=bool(entity.is_active),
        sortOrder=int(entity.sort_order or 0),
        createdAt=entity.created_at,
        updatedAt=entity.updated_at,
    )
