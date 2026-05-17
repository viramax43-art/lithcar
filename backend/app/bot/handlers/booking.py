from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import default_state
from aiogram.types import CallbackQuery, Message

from app.bot.keyboards.booking import (
    CANCEL_LABEL,
    confirm_keyboard,
    edit_keyboard,
    welcome_keyboard,
)
from app.bot.services.user_binding import get_or_create_passenger_from_telegram
from app.bot.states.booking import BookingStates
from app.db import async_session_factory
from app.services.pricing_service import get_or_create_pricing
from app.services.ride_booking_service import (
    InsufficientPointsError,
    InvalidRideDateTimeError,
    book_ride_with_points,
)

router = Router(name="booking")


def format_point(*, lat: float, lng: float) -> str:
    return f"{lat:.6f}, {lng:.6f}"


def parse_manual_date(text: str) -> date | None:
    value = text.strip()
    try:
        return datetime.strptime(value, "%d.%m.%Y").date()
    except ValueError:
        return None


def parse_manual_time(text: str) -> time | None:
    value = text.strip()
    try:
        parsed = datetime.strptime(value, "%H:%M")
        return time(hour=parsed.hour, minute=parsed.minute)
    except ValueError:
        return None


def combine_booking_datetime(*, ride_date: date, ride_time: time) -> datetime:
    return datetime.combine(ride_date, ride_time).replace(tzinfo=timezone.utc)


def resolve_quick_time(*, ride_date: date, minutes: int) -> time:
    now = datetime.now(timezone.utc)
    base = datetime.combine(ride_date, now.time()).replace(tzinfo=timezone.utc)
    return (base + timedelta(minutes=minutes)).time().replace(second=0, microsecond=0)


def get_selected_datetime(data: dict) -> datetime:
    ride_date = date.fromisoformat(data["ride_date"])
    ride_time = time.fromisoformat(data["ride_time"])
    return combine_booking_datetime(ride_date=ride_date, ride_time=ride_time)


async def _load_user_and_pricing(message: Message):
    async with async_session_factory() as db_session:
        user = await get_or_create_passenger_from_telegram(
            db_session,
            telegram_user=message.from_user,
        )
        pricing = await get_or_create_pricing(db_session)
        return user, pricing


async def _show_confirmation(message: Message, state: FSMContext):
    data = await state.get_data()
    user, pricing = await _load_user_and_pricing(message)
    ride_datetime = get_selected_datetime(data)
    text = (
        "Проверьте детали поездки:\n\n"
        f"Точка A: {data['from_address']}\n"
        f"Точка B: {data['to_address']}\n"
        f"Дата и время: {ride_datetime.strftime('%d.%m.%Y %H:%M')} UTC\n\n"
        f"Стоимость: {pricing.points_per_ride} поинтов\n"
        f"Ваш баланс: {int(user.points_balance or 0)} поинтов"
    )
    await state.set_state(BookingStates.confirming)
    await message.answer(text, reply_markup=confirm_keyboard())


WELCOME_TEXT = (
    "Добро пожаловать в Ride! 🚗\n\n"
    "Мы — сервис для удобных групповых поездок. С нами вы можете быстро и с комфортом "
    "добраться до нужной точки, оплачивая поездки внутренними поинтами.\n\n"
    "💡 Обратите внимание: приобрести поинты можно внутри нашего Mini App.\n\n"
    "Выберите удобный способ оформления поездки:"
)

@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await message.answer(
        WELCOME_TEXT,
        reply_markup=welcome_keyboard(),
    )


@router.message(F.text == CANCEL_LABEL)
async def cancel_flow(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("Оформление отменено.\n\n" + WELCOME_TEXT, reply_markup=welcome_keyboard())


@router.callback_query(F.data == "start_bot_booking", default_state)
async def begin_booking_callback(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await state.set_state(BookingStates.awaiting_from_location)
    await callback.message.answer(
        "Отправьте геопозицию точки A (откуда вас забрать).",
    )
    await callback.answer()


@router.message(BookingStates.awaiting_from_location, ~F.location)
async def reject_non_location_from(message: Message):
    await message.answer(
        "Нужна именно геопозиция. Отправьте точку A через вложение локации в Telegram.",
    )


@router.message(BookingStates.awaiting_from_location, F.location)
async def set_from_location(message: Message, state: FSMContext):
    from_point = {
        "from_lat": message.location.latitude,
        "from_lng": message.location.longitude,
        "from_address": format_point(lat=message.location.latitude, lng=message.location.longitude),
    }
    await state.update_data(**from_point)
    await state.set_state(BookingStates.awaiting_to_location)
    await message.answer(
        "Отлично. Теперь отправьте геопозицию точки B (куда поедем).",
    )


@router.message(BookingStates.awaiting_to_location, ~F.location)
async def reject_non_location_to(message: Message):
    await message.answer(
        "Нужна геопозиция точки B. Отправьте локацию сообщением.",
    )


@router.message(BookingStates.awaiting_to_location, F.location)
async def set_to_location(message: Message, state: FSMContext):
    to_point = {
        "to_lat": message.location.latitude,
        "to_lng": message.location.longitude,
        "to_address": format_point(lat=message.location.latitude, lng=message.location.longitude),
    }
    await state.update_data(**to_point)
    await state.set_state(BookingStates.awaiting_date)
    await message.answer("Введите дату поездки в формате ДД.ММ.ГГГГ.")


@router.message(BookingStates.awaiting_date, F.text)
async def pick_date_manual(message: Message, state: FSMContext):
    chosen_date = parse_manual_date(message.text)
    if chosen_date is None:
        await message.answer("Не понял дату. Пример: 21.05.2026")
        return
    if chosen_date < date.today():
        await message.answer("Дата не может быть в прошлом.")
        return
    await state.update_data(ride_date=chosen_date.isoformat())
    await state.set_state(BookingStates.awaiting_time)
    await message.answer("Дата сохранена. Теперь введите время в формате ЧЧ:ММ.")


@router.message(BookingStates.awaiting_time, F.text)
async def pick_time_manual(message: Message, state: FSMContext):
    ride_time = parse_manual_time(message.text)
    if ride_time is None:
        await message.answer("Неверный формат времени. Пример: 19:30")
        return
    await state.update_data(ride_time=ride_time.isoformat())
    await _show_confirmation(message, state)


@router.callback_query(BookingStates.confirming, F.data == "confirm:cancel")
async def cancel_from_confirm(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.answer("Оформление отменено.\n\n" + WELCOME_TEXT, reply_markup=welcome_keyboard())
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "confirm:edit")
async def edit_from_confirm(callback: CallbackQuery):
    await callback.message.answer("Что хотите изменить?", reply_markup=edit_keyboard())
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:back")
async def edit_back(callback: CallbackQuery):
    await callback.message.answer("Возвращаю подтверждение.", reply_markup=confirm_keyboard())
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:from")
async def edit_from_point(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_from_location)
    await callback.message.answer("Отправьте новую геопозицию точки A.")
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:to")
async def edit_to_point(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_to_location)
    await callback.message.answer("Отправьте новую геопозицию точки B.")
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:date")
async def edit_date(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_date)
    await callback.message.answer("Введите новую дату в формате ДД.ММ.ГГГГ.")
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:time")
async def edit_time(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_time)
    await callback.message.answer("Введите новое время в формате ЧЧ:ММ.")
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "confirm:submit")
async def submit_booking(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    if data.get("submitted"):
        await callback.answer("Заявка уже обрабатывается.")
        return
    await state.update_data(submitted=True)

    try:
        ride_datetime = get_selected_datetime(data)
        async with async_session_factory() as db_session:
            user = await get_or_create_passenger_from_telegram(
                db_session,
                telegram_user=callback.from_user,
            )
            booking = await book_ride_with_points(
                db_session,
                user=user,
                passenger_name=callback.from_user.full_name,
                passenger_phone=f"tg:{callback.from_user.id}",
                from_address=data["from_address"],
                from_lat=data["from_lat"],
                from_lng=data["from_lng"],
                to_address=data["to_address"],
                to_lat=data["to_lat"],
                to_lng=data["to_lng"],
                date_time=ride_datetime,
            )
    except InsufficientPointsError as exc:
        await state.update_data(submitted=False)
        await callback.message.answer(
            "Недостаточно поинтов для оформления.\n"
            f"Нужно: {exc.required_points}, у вас: {exc.current_balance}."
        )
        await callback.answer()
        return
    except (InvalidRideDateTimeError, ValueError) as exc:
        await state.update_data(submitted=False)
        await callback.message.answer(f"Не удалось оформить поездку: {exc}")
        await callback.answer()
        return

    await state.clear()
    await callback.message.answer(
        "Поездка оформлена.\n"
        f"Списано: {booking.points_debited} поинтов\n"
        f"Остаток: {booking.points_balance_after} поинтов\n"
        "Статус заявки будет отображаться в приложении.\n\n"
        + WELCOME_TEXT,
        reply_markup=welcome_keyboard(),
    )
    await callback.answer("Готово")


@router.callback_query(F.data == "confirm:submit")
async def duplicate_submit(callback: CallbackQuery):
    await callback.answer("Эта заявка уже обработана.", show_alert=True)
