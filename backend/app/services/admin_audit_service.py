from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit_event import AdminAuditEvent


async def add_audit_event(
    db_session: AsyncSession,
    *,
    actor_type: str,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    payload: dict[str, Any],
) -> AdminAuditEvent:
    event = AdminAuditEvent(
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        payload=payload,
    )
    db_session.add(event)
    return event
