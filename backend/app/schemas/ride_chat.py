from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import settings


class RideChatMessageOut(BaseModel):
    """Сообщение чата поездки в том виде, в котором его рисует Mini App."""

    id: str
    rideId: str
    senderType: str  # driver | passenger | system
    senderName: str
    kind: str  # text | quick_reply | system
    body: str
    payload: dict[str, Any] | None = None
    createdAt: datetime
    mine: bool = False
    readByOthers: bool = False


class RideChatParticipantOut(BaseModel):
    type: str  # driver | passenger
    name: str
    rideId: str
    isMe: bool = False


class RideChatPageOut(BaseModel):
    rideId: str
    threadKey: str
    items: list[RideChatMessageOut]
    unreadCount: int
    canSend: bool
    closedReason: str | None = None
    participants: list[RideChatParticipantOut] = Field(default_factory=list)


class RideChatSendIn(BaseModel):
    body: str = Field(min_length=1, max_length=settings.ride_chat_max_length)
    quick: str | None = Field(default=None, max_length=32)


def message_to_out(
    message,
    *,
    viewer_type: str,
    peer_last_read_at: datetime | None,
) -> RideChatMessageOut:
    mine = message.sender_type == viewer_type
    read_by_others = False
    if mine and peer_last_read_at is not None and message.created_at is not None:
        read_by_others = peer_last_read_at >= message.created_at
    return RideChatMessageOut(
        id=message.id,
        rideId=message.ride_id,
        senderType=message.sender_type,
        senderName=message.sender_name or "",
        kind=message.kind,
        body=message.body,
        payload=message.payload if isinstance(message.payload, dict) else None,
        createdAt=message.created_at,
        mine=mine,
        readByOthers=read_by_others,
    )


def build_chat_page(
    *,
    ride,
    thread_key: str,
    messages: list,
    viewer_type: str,
    peer_last_read_at: datetime | None,
    unread_count: int,
    can_send: bool,
    closed_reason: str | None,
    participants: list[RideChatParticipantOut] | None = None,
) -> RideChatPageOut:
    return RideChatPageOut(
        rideId=ride.id,
        threadKey=thread_key,
        items=[
            message_to_out(message, viewer_type=viewer_type, peer_last_read_at=peer_last_read_at)
            for message in messages
        ],
        unreadCount=unread_count,
        canSend=can_send,
        closedReason=closed_reason,
        participants=participants or [],
    )


__all__ = [
    "RideChatMessageOut",
    "RideChatPageOut",
    "RideChatParticipantOut",
    "RideChatSendIn",
    "build_chat_page",
    "message_to_out",
]
