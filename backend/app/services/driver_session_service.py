from __future__ import annotations

from fastapi import Response

from app.core.config import settings
from app.core.security import create_driver_session_token


def apply_driver_session_cookie(response: Response, *, driver_id: str) -> None:
    token = create_driver_session_token(driver_id=driver_id)
    response.set_cookie(
        key=settings.driver_session_cookie_name,
        value=token,
        max_age=settings.driver_session_ttl_hours * 3600,
        httponly=True,
        secure=settings.admin_session_cookie_secure,
        samesite="lax",
        path="/",
    )
