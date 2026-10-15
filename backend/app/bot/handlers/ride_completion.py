from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.bot.i18n import t
from app.db import async_session_factory
from app.services import ride_flow_side_effects, ride_status_service
from app.services.ride_status_service import RideFlowError
from app.services.user_service import get_user_by_id


router = Router(name="ride_completion")


async def _replace_message(callback: CallbackQuery, text: str) -> None:
    """Убираем клавиатуру [Да]/[Нет]: повторно отвечать на вопрос не нужно."""
    message = callback.message
    if message is None:
        return
    try:
        await message.edit_text(text)
    except Exception:  # noqa: BLE001
        # Сообщение могло быть удалено или уже изменено — ответ пользователя всё равно учтён.
        try:
            await message.answer(text)
        except Exception:  # noqa: BLE001
            pass


@router.callback_query(F.data.startswith("ride_completion:"))
async def handle_ride_completion(callback: CallbackQuery):
    """Ответ пассажира на «Поездка состоялась?» кнопкой в Telegram.

    Логика совпадает с кнопкой в приложении: «Да» закрывает поездку (водитель забыл
    нажать кнопку), «Нет» уводит её администратору. Повторный клик безопасен —
    сервис идемпотентен, а сообщение просто теряет кнопки.
    """
    parts = (callback.data or "").split(":")
    if len(parts) != 3 or parts[2] not in ("yes", "no"):
        await callback.answer(t("ride_completion.not_found", "lt"), show_alert=True)
        return

    ride_id, answer = parts[1], parts[2]
    passenger_id = str(callback.from_user.id)
    lang = "lt"
    error_message: str | None = None
    already_closed = False
    result = None

    async with async_session_factory() as db_session:
        user = await get_user_by_id(db_session, user_id=passenger_id)
        if user is not None:
            lang = user.preferred_language
        try:
            result = await ride_status_service.confirm_ride_completion(
                db_session,
                ride_id=ride_id,
                user_id=passenger_id,
                completed=answer == "yes",
            )
        except RideFlowError as exc:
            error_message = exc.message
            already_closed = exc.code == "ride_closed"

    if error_message is not None:
        await callback.answer(
            t("ride_completion.already", lang) if already_closed else error_message,
            show_alert=True,
        )
        return

    if result is None:
        await callback.answer(t("ride_completion.not_found", lang), show_alert=True)
        return

    # Telegram отправляем после коммита — и только если что-то реально изменилось.
    await ride_flow_side_effects.deliver_flow_side_effects(result)

    text = t(
        "ride_completion.confirmed" if answer == "yes" else "ride_completion.declined",
        lang,
    )
    if not result.changed:
        text = t("ride_completion.already", lang)

    await _replace_message(callback, text)
    await callback.answer(text)
