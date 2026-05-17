from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.driver import Driver
from app.models.driver_qr_sale import DriverQrSale, DriverQrSaleSettlementStatus
from app.models.user import User
from app.services.pricing_service import get_or_create_pricing


async def issue_driver_qr_sale(
    db_session: AsyncSession,
    *,
    driver_id: str,
    points_amount: int,
) -> DriverQrSale:
    pricing = await get_or_create_pricing(db_session)
    eur_amount_cents = int(points_amount) * int(pricing.point_price_cents)
    sale = DriverQrSale(
        driver_id=driver_id,
        points_amount=points_amount,
        eur_amount_cents=eur_amount_cents,
    )
    db_session.add(sale)
    await db_session.flush()
    return sale


async def invalidate_driver_active_qr_sales(
    db_session: AsyncSession,
    *,
    driver_id: str,
) -> int:
    stmt = (
        update(DriverQrSale)
        .where(
            and_(
                DriverQrSale.driver_id == driver_id,
                DriverQrSale.redeemed_at.is_(None),
                DriverQrSale.cash_settlement_status == DriverQrSaleSettlementStatus.OWED_TO_DRIVER,
            )
        )
        .values(cash_settlement_status=DriverQrSaleSettlementStatus.CANCELLED_BEFORE_REDEEM)
    )
    result = await db_session.execute(stmt)
    return int(result.rowcount or 0)


async def consume_driver_qr_sale(
    db_session: AsyncSession,
    *,
    token: str,
    redeemed_by_user_id: str,
) -> DriverQrSale | None:
    now = datetime.now(timezone.utc)
    stmt = (
        update(DriverQrSale)
        .where(
            and_(
                DriverQrSale.token == token,
                DriverQrSale.redeemed_at.is_(None),
                DriverQrSale.cash_settlement_status == DriverQrSaleSettlementStatus.OWED_TO_DRIVER,
            )
        )
        .values(redeemed_at=now, redeemed_by_user_id=redeemed_by_user_id)
        .returning(DriverQrSale)
    )
    result = await db_session.execute(stmt)
    row = result.scalar_one_or_none()
    return row


async def get_driver_qr_sale_by_token(db_session: AsyncSession, *, token: str) -> DriverQrSale | None:
    result = await db_session.execute(select(DriverQrSale).where(DriverQrSale.token == token))
    return result.scalar_one_or_none()


async def list_driver_qr_sales(
    db_session: AsyncSession,
    *,
    driver_id: str | None = None,
    redeemed_by_user_id: str | None = None,
    settlement_status: str | None = None,
    redeemed_only: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[tuple[DriverQrSale, str | None, str | None]], int]:
    driver_alias = aliased(Driver)
    user_alias = aliased(User)
    base_filters = []
    if driver_id:
        base_filters.append(DriverQrSale.driver_id == driver_id)
    if redeemed_by_user_id:
        base_filters.append(DriverQrSale.redeemed_by_user_id == redeemed_by_user_id)
    if settlement_status:
        base_filters.append(DriverQrSale.cash_settlement_status == settlement_status)
    if redeemed_only is True:
        base_filters.append(DriverQrSale.redeemed_at.is_not(None))
    elif redeemed_only is False:
        base_filters.append(DriverQrSale.redeemed_at.is_(None))

    query = (
        select(DriverQrSale, driver_alias.name, user_alias.username)
        .select_from(DriverQrSale)
        .join(driver_alias, DriverQrSale.driver_id == driver_alias.id)
        .outerjoin(user_alias, DriverQrSale.redeemed_by_user_id == user_alias.user_id)
        .where(*base_filters)
        .order_by(DriverQrSale.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_query = (
        select(func.count())
        .select_from(DriverQrSale)
        .where(*base_filters)
    )
    rows = await db_session.execute(query)
    count = await db_session.execute(count_query)
    return list(rows.all()), int(count.scalar_one() or 0)


async def list_driver_debts_summary(
    db_session: AsyncSession,
    *,
    driver_id: str,
    limit: int = 30,
) -> tuple[int, list[DriverQrSale]]:
    debt_stmt = select(
        func.coalesce(func.sum(DriverQrSale.eur_amount_cents), 0)
    ).where(
        DriverQrSale.driver_id == driver_id,
        DriverQrSale.redeemed_at.is_not(None),
        DriverQrSale.cash_settlement_status == "owed_to_driver",
    )
    items_stmt = (
        select(DriverQrSale)
        .where(
            DriverQrSale.driver_id == driver_id,
            DriverQrSale.redeemed_at.is_not(None),
        )
        .order_by(DriverQrSale.redeemed_at.desc(), DriverQrSale.created_at.desc())
        .limit(limit)
    )
    total_result = await db_session.execute(debt_stmt)
    items_result = await db_session.execute(items_stmt)
    return int(total_result.scalar_one() or 0), list(items_result.scalars().all())
