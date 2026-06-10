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
    sendTelegram: bool = False


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    limit: int
    offset: int


class UnreadCountOut(BaseModel):
    count: int


class AdminSendNotificationIn(BaseModel):
    pool: Literal["passenger", "driver"]
    mode: Literal["broadcast", "single"]
    recipientId: str | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    sendTelegram: bool = False


class AdminSendNotificationOut(BaseModel):
    sentCount: int


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
        sendTelegram=bool(entity.send_telegram),
    )
