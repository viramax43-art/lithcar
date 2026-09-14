from __future__ import annotations

from fastapi import Response

from app.core.config import settings


def _cookie_secure() -> bool:
    return settings.is_production or settings.passenger_session_cookie_secure


def set_passenger_auth_cookies(response: Response, *, access_token: str, refresh_token: str) -> None:
    secure = _cookie_secure()
    response.set_cookie(
        key=settings.passenger_access_cookie_name,
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=settings.passenger_refresh_cookie_name,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/api",
    )


def clear_passenger_auth_cookies(response: Response) -> None:
    secure = _cookie_secure()
    response.delete_cookie(
        key=settings.passenger_access_cookie_name,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.delete_cookie(
        key=settings.passenger_refresh_cookie_name,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/api",
    )
