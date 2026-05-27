from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.db import async_session_factory
from app.services.ride_request_service import confirm_pickup_point


router = Router(name="pickup_confirm")


@router.callback_query(F.data.startswith("pickup_confirm:"))
async def handle_pickup_confirm(callback: CallbackQuery):
    """Passenger confirms the new pickup point via inline button in bot chat."""
    request_id = callback.data.split(":", 1)[1]
    passenger_id = str(callback.from_user.id)

    async with async_session_factory() as db_session:
        request, error = await confirm_pickup_point(
            db_session,
            request_id=request_id,
            passenger_id=passenger_id,
        )

    if error:
        await callback.answer(error, show_alert=True)
        return

    if request is None:
        await callback.answer("Поездка не найдена.", show_alert=True)
        return

    await callback.message.edit_text(
        f"✅ Точка посадки подтверждена!\n\n"
        f"Адрес: {request.from_address}\n\n"
        "Спасибо! Водитель уже знает.",
    )
    await callback.answer("Точка подтверждена!")
