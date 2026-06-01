from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.bot.i18n import t
from app.db import async_session_factory
from app.services.ride_request_service import confirm_pickup_point
from app.services.user_service import get_user_by_id


router = Router(name="pickup_confirm")


@router.callback_query(F.data.startswith("pickup_confirm:"))
async def handle_pickup_confirm(callback: CallbackQuery):
    """Passenger confirms the new pickup point via inline button in bot chat."""
    request_id = callback.data.split(":", 1)[1]
    passenger_id = str(callback.from_user.id)
    lang = "lt"

    async with async_session_factory() as db_session:
        user = await get_user_by_id(db_session, user_id=passenger_id)
        if user is not None:
            lang = user.preferred_language
        request, error = await confirm_pickup_point(
            db_session,
            request_id=request_id,
            passenger_id=passenger_id,
        )

    if error:
        await callback.answer(error, show_alert=True)
        return

    if request is None:
        await callback.answer(t("pickup.not_found", lang), show_alert=True)
        return

    await callback.message.edit_text(
        f"✅ {t('pickup.confirmed', lang)}\n\n"
        f"{t('pickup.address', lang)}: {request.from_address}\n\n"
        f"{t('pickup.thanks', lang)}",
    )
    await callback.answer(t("pickup.confirmed", lang))
