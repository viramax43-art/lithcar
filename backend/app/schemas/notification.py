from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.core.i18n_text import normalize_user_info_text_i18n


class UserInfoTextI18nOut(BaseModel):
    lt: str = ""
    pl: str = ""
    en: str = ""
    ru: str = ""


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
    titleI18n: UserInfoTextI18nOut
    bodyI18n: UserInfoTextI18nOut
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
    titleI18n: UserInfoTextI18nOut | str
    bodyI18n: UserInfoTextI18nOut | str
    audience: Literal["all", "user"] = "all"
    targetUsername: str | None = Field(default=None, max_length=64)

    @field_validator("titleI18n", mode="before")
    @classmethod
    def normalize_title_i18n(cls, value: Any) -> UserInfoTextI18nOut:
        return UserInfoTextI18nOut(**normalize_user_info_text_i18n(value))

    @field_validator("bodyI18n", mode="before")
    @classmethod
    def normalize_body_i18n(cls, value: Any) -> UserInfoTextI18nOut:
        return UserInfoTextI18nOut(**normalize_user_info_text_i18n(value))


class UpdateInfoBlockIn(BaseModel):
    titleI18n: UserInfoTextI18nOut | str | None = None
    bodyI18n: UserInfoTextI18nOut | str | None = None
    isActive: bool | None = None

    @field_validator("titleI18n", mode="before")
    @classmethod
    def normalize_title_i18n(cls, value: Any) -> UserInfoTextI18nOut | None:
        if value is None:
            return None
        return UserInfoTextI18nOut(**normalize_user_info_text_i18n(value))

    @field_validator("bodyI18n", mode="before")
    @classmethod
    def normalize_body_i18n(cls, value: Any) -> UserInfoTextI18nOut | None:
        if value is None:
            return None
        return UserInfoTextI18nOut(**normalize_user_info_text_i18n(value))


def notification_to_out(entity, *, language: str | None = None) -> NotificationOut:
    from app.services.notification_service import resolve_notification_text

    title, body = resolve_notification_text(entity, language=language)
    return NotificationOut(
        id=entity.id,
        pool=entity.pool,
        type=entity.type,
        title=title,
        body=body,
        payload=entity.payload,
        readAt=entity.read_at,
        createdAt=entity.created_at,
    )


def info_block_to_out(entity) -> InfoBlockOut:
    return InfoBlockOut(
        id=entity.id,
        pool=entity.pool,
        titleI18n=UserInfoTextI18nOut(**normalize_user_info_text_i18n(entity.title_i18n)),
        bodyI18n=UserInfoTextI18nOut(**normalize_user_info_text_i18n(entity.body_i18n)),
        audience=entity.audience or "all",
        targetUsername=entity.target_username,
        isActive=bool(entity.is_active),
        sortOrder=int(entity.sort_order or 0),
        createdAt=entity.created_at,
        updatedAt=entity.updated_at,
    )
