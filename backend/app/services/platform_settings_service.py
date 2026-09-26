from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_settings import PlatformSettings

DEFAULT_PLATFORM_CONFIG: dict[str, Any] = {
    "passenger": {
        "defaultPointsBalance": 100,
        "allowBuyPointsFromDriverWhenEmpty": True,
        "allowDriverCashWhenEmpty": True,
        "allowDriverCardWhenEmpty": True,
        "promoMessageTemplate": {"lt": "", "pl": "", "en": "", "ru": ""},
        "showDestinationZones": False,
    },
    "driver": {
        "reassignmentEnabled": True,
        "reassignmentBonusPoints": 5,
        "reassignmentPriorityBoost": True,
        "defaultCanSellPoints": True,
        "defaultCanSelfAssign": False,
    },
    "system": {
        "eurUsdRate": 1.08,
        "kmRatioMultiplier": 1.0,
        "staleRequestMinutesPending": 30,
        "staleRequestMinutesPastRide": 5,
        "autoDeleteStaleRequests": True,
        "manualDeleteStaleRequests": True,
        "pickupZonesVisibleToPassengers": True,
        "destinationZonesVisibleToDrivers": True,
        "destinationZonesVisibleToPassengers": False,
        "driverNotificationWindowStart": "06:00",
        "driverNotificationWindowEnd": "22:00",
        "passengerNotificationWindowStart": "06:00",
        "passengerNotificationWindowEnd": "22:00",
        "sidebarCompactOnMap": True,
    },
    "promotions": {
        "enabled": False,
        "templates": [],
    },
}


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def normalize_platform_config(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw:
        return copy.deepcopy(DEFAULT_PLATFORM_CONFIG)
    return _deep_merge(DEFAULT_PLATFORM_CONFIG, raw)


async def get_or_create_platform_settings(db_session: AsyncSession) -> PlatformSettings:
    row = await db_session.get(PlatformSettings, 1)
    if row is not None:
        row.config_json = normalize_platform_config(row.config_json)
        return row
    row = PlatformSettings(id=1, config_json=copy.deepcopy(DEFAULT_PLATFORM_CONFIG))
    db_session.add(row)
    await db_session.flush()
    return row


async def get_platform_config(db_session: AsyncSession) -> dict[str, Any]:
    row = await get_or_create_platform_settings(db_session)
    return normalize_platform_config(row.config_json)


async def update_platform_config(
    db_session: AsyncSession,
    patch: dict[str, Any],
) -> dict[str, Any]:
    row = await get_or_create_platform_settings(db_session)
    merged = _deep_merge(normalize_platform_config(row.config_json), patch)
    row.config_json = merged
    await db_session.commit()
    await db_session.refresh(row)
    return merged


def default_passenger_points(config: dict[str, Any] | None = None) -> int:
    cfg = normalize_platform_config(config)
    value = int(cfg.get("passenger", {}).get("defaultPointsBalance", 100))
    return max(0, value)
