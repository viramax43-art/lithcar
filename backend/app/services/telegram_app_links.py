from __future__ import annotations

from app.core.config import settings


def build_telegram_mini_app_url(*, startapp: str | None = None) -> str:
    base = settings.telegram_mini_app_url.strip().rstrip("/")
    if not startapp:
        return base
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}startapp={startapp}"


def build_driver_cabinet_url() -> str:
    """Direct web URL to the driver cabinet (/driver), not the passenger Mini App."""
    base = settings.frontend_public_url.strip().rstrip("/")
    return f"{base}/driver"
