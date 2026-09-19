from __future__ import annotations

import html
import json
from datetime import date, datetime, time, timedelta, timezone

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import default_state
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, User as TgUser

from app.bot.datetime_format import format_bot_date_time_html
from app.bot.i18n import normalize_lang, t
from app.core.app_timezone import normalize_app_datetime, to_app_local
from app.bot.keyboards.booking import (
    confirm_keyboard,
    edit_keyboard,
    map_picker_keyboard,
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
from app.services.user_service import update_user_language

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
    return normalize_app_datetime(datetime.combine(ride_date, ride_time))


def resolve_quick_time(*, ride_date: date, minutes: int) -> time:
    _ = ride_date
    target_local = to_app_local(datetime.now(timezone.utc)) + timedelta(minutes=minutes)
    return target_local.time().replace(second=0, microsecond=0)


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


async def _load_user(telegram_user: TgUser):
    async with async_session_factory() as db_session:
        return await get_or_create_passenger_from_telegram(
            db_session,
            telegram_user=telegram_user,
        )


def _language_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Lietuviu", callback_data="language:set:lt"),
                InlineKeyboardButton(text="Polski", callback_data="language:set:pl"),
            ],
            [
                InlineKeyboardButton(text="English", callback_data="language:set:en"),
                InlineKeyboardButton(text="Русский", callback_data="language:set:ru"),
            ],
        ]
    )


async def _get_user_lang(telegram_user: TgUser) -> str:
    user = await _load_user(telegram_user)
    return normalize_lang(user.preferred_language)


async def _prompt_point(message: Message, *, field: str, text_key: str, lang: str):
    await message.answer(
        t(text_key, lang),
        reply_markup=map_picker_keyboard(lang, field),
    )


async def _apply_picked_point(
    message: Message,
    state: FSMContext,
    *,
    expected_field: str,
    field: str,
    lat: float,
    lng: float,
    address: str,
) -> bool:
    if field != expected_field:
        return False

    lang = await _get_user_lang(message.from_user)

    if expected_field == "from":
        await state.update_data(
            from_lat=lat,
            from_lng=lng,
            from_address=address,
        )
        await state.set_state(BookingStates.awaiting_to_location)
        await _prompt_point(message, field="to", text_key="booking.ask_point_b", lang=lang)
        return True

    if expected_field == "to":
        await state.update_data(
            to_lat=lat,
            to_lng=lng,
            to_address=address,
        )
        await state.set_state(BookingStates.awaiting_date)
        await message.answer(t("booking.ask_date", lang))
        return True

    return False


async def _show_confirmation(message: Message, state: FSMContext):
    data = await state.get_data()
    user, pricing = await _load_user_and_pricing(message)
    lang = normalize_lang(user.preferred_language)
    ride_datetime = get_selected_datetime(data)
    text = (
        f"{t('booking.confirm.title', lang)}\n\n"
        f"{t('booking.pointA', lang)}: {html.escape(str(data['from_address']))}\n"
        f"{t('booking.pointB', lang)}: {html.escape(str(data['to_address']))}\n"
        f"{format_bot_date_time_html(ride_datetime, lang)}\n\n"
        f"{t('booking.cost', lang)}: {pricing.points_per_ride}\n"
        f"{t('booking.balance', lang)}: {int(user.points_balance or 0)}"
    )
    await state.set_state(BookingStates.confirming)
    await message.answer(text, reply_markup=confirm_keyboard(lang), parse_mode="HTML")


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    lang = await _get_user_lang(message.from_user)
    await message.answer(
        t("menu.welcome", lang),
        reply_markup=welcome_keyboard(lang),
    )


@router.message(F.text.in_(("Отмена", "Cancel", "Anuluj", "Atsaukti")))
async def cancel_flow(message: Message, state: FSMContext):
    await state.clear()
    lang = await _get_user_lang(message.from_user)
    await message.answer(
        f"{t('menu.cancelled', lang)}\n\n{t('menu.welcome', lang)}",
        reply_markup=welcome_keyboard(lang),
    )


@router.callback_query(F.data == "language:choose")
async def choose_language(callback: CallbackQuery):
    lang = await _get_user_lang(callback.from_user)
    await callback.message.answer(t("lang.pick", lang), reply_markup=_language_keyboard())
    await callback.answer()


@router.callback_query(F.data.startswith("language:set:"))
async def set_language(callback: CallbackQuery):
    lang = callback.data.split(":")[-1]
    async with async_session_factory() as db_session:
        user = await get_or_create_passenger_from_telegram(
            db_session,
            telegram_user=callback.from_user,
        )
        await update_user_language(db_session, user=user, preferred_language=lang)
        normalized = normalize_lang(user.preferred_language)
    await callback.message.answer(
        f"{t('lang.changed', normalized)}\n\n{t('menu.welcome', normalized)}",
        reply_markup=welcome_keyboard(normalized),
    )
    await callback.answer()


@router.callback_query(F.data == "start_bot_booking", default_state)
async def begin_booking_callback(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await state.set_state(BookingStates.awaiting_from_location)
    lang = await _get_user_lang(callback.from_user)
    await _prompt_point(callback.message, field="from", text_key="booking.ask_point_a", lang=lang)
    await callback.answer()


@router.message(BookingStates.awaiting_from_location, F.web_app_data)
async def pick_from_via_map(message: Message, state: FSMContext):
    lang = await _get_user_lang(message.from_user)
    try:
        payload = json.loads(message.web_app_data.data)
        lat = float(payload["lat"])
        lng = float(payload["lng"])
        address = str(payload.get("address") or format_point(lat=lat, lng=lng))
        field = str(payload.get("field") or "from")
    except (TypeError, ValueError, json.JSONDecodeError, KeyError):
        await _prompt_point(message, field="from", text_key="booking.ask_point_a_retry", lang=lang)
        return
    if not await _apply_picked_point(
        message,
        state,
        expected_field="from",
        field=field,
        lat=lat,
        lng=lng,
        address=address,
    ):
        await _prompt_point(message, field="from", text_key="booking.ask_point_a_retry", lang=lang)


@router.message(BookingStates.awaiting_from_location, ~F.location, ~F.web_app_data)
async def reject_non_location_from(message: Message):
    lang = await _get_user_lang(message.from_user)
    await _prompt_point(message, field="from", text_key="booking.ask_point_a_retry", lang=lang)


@router.message(BookingStates.awaiting_from_location, F.location)
async def set_from_location(message: Message, state: FSMContext):
    from_point = {
        "from_lat": message.location.latitude,
        "from_lng": message.location.longitude,
        "from_address": format_point(lat=message.location.latitude, lng=message.location.longitude),
    }
    await state.update_data(**from_point)
    await state.set_state(BookingStates.awaiting_to_location)
    lang = await _get_user_lang(message.from_user)
    await _prompt_point(message, field="to", text_key="booking.ask_point_b", lang=lang)


@router.message(BookingStates.awaiting_to_location, F.web_app_data)
async def pick_to_via_map(message: Message, state: FSMContext):
    lang = await _get_user_lang(message.from_user)
    try:
        payload = json.loads(message.web_app_data.data)
        lat = float(payload["lat"])
        lng = float(payload["lng"])
        address = str(payload.get("address") or format_point(lat=lat, lng=lng))
        field = str(payload.get("field") or "to")
    except (TypeError, ValueError, json.JSONDecodeError, KeyError):
        await _prompt_point(message, field="to", text_key="booking.ask_point_b_retry", lang=lang)
        return
    if not await _apply_picked_point(
        message,
        state,
        expected_field="to",
        field=field,
        lat=lat,
        lng=lng,
        address=address,
    ):
        await _prompt_point(message, field="to", text_key="booking.ask_point_b_retry", lang=lang)


@router.message(BookingStates.awaiting_to_location, ~F.location, ~F.web_app_data)
async def reject_non_location_to(message: Message):
    lang = await _get_user_lang(message.from_user)
    await _prompt_point(message, field="to", text_key="booking.ask_point_b_retry", lang=lang)


@router.message(BookingStates.awaiting_to_location, F.location)
async def set_to_location(message: Message, state: FSMContext):
    to_point = {
        "to_lat": message.location.latitude,
        "to_lng": message.location.longitude,
        "to_address": format_point(lat=message.location.latitude, lng=message.location.longitude),
    }
    await state.update_data(**to_point)
    await state.set_state(BookingStates.awaiting_date)
    lang = await _get_user_lang(message.from_user)
    await message.answer(t("booking.ask_date", lang))


@router.message(BookingStates.awaiting_date, F.text)
async def pick_date_manual(message: Message, state: FSMContext):
    lang = await _get_user_lang(message.from_user)
    chosen_date = parse_manual_date(message.text)
    if chosen_date is None:
        await message.answer(t("booking.ask_date_retry", lang))
        return
    if chosen_date < date.today():
        await message.answer(t("booking.date_in_past", lang))
        return
    await state.update_data(ride_date=chosen_date.isoformat())
    await state.set_state(BookingStates.awaiting_time)
    await message.answer(t("booking.ask_time", lang))


@router.message(BookingStates.awaiting_time, F.text)
async def pick_time_manual(message: Message, state: FSMContext):
    lang = await _get_user_lang(message.from_user)
    ride_time = parse_manual_time(message.text)
    if ride_time is None:
        await message.answer(t("booking.ask_time_retry", lang))
        return
    await state.update_data(ride_time=ride_time.isoformat())
    await _show_confirmation(message, state)


@router.callback_query(BookingStates.confirming, F.data == "confirm:cancel")
async def cancel_from_confirm(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    lang = await _get_user_lang(callback.from_user)
    await callback.message.answer(
        f"{t('menu.cancelled', lang)}\n\n{t('menu.welcome', lang)}",
        reply_markup=welcome_keyboard(lang),
    )
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "confirm:edit")
async def edit_from_confirm(callback: CallbackQuery):
    lang = await _get_user_lang(callback.from_user)
    await callback.message.answer(t("booking.edit_prompt", lang), reply_markup=edit_keyboard(lang))
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:back")
async def edit_back(callback: CallbackQuery):
    lang = await _get_user_lang(callback.from_user)
    await callback.message.answer(t("booking.back_to_confirm", lang), reply_markup=confirm_keyboard(lang))
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:from")
async def edit_from_point(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_from_location)
    lang = await _get_user_lang(callback.from_user)
    await _prompt_point(callback.message, field="from", text_key="booking.ask_point_a_new", lang=lang)
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:to")
async def edit_to_point(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_to_location)
    lang = await _get_user_lang(callback.from_user)
    await _prompt_point(callback.message, field="to", text_key="booking.ask_point_b_new", lang=lang)
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:date")
async def edit_date(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_date)
    lang = await _get_user_lang(callback.from_user)
    await callback.message.answer(t("booking.ask_date_new", lang))
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "edit:time")
async def edit_time(callback: CallbackQuery, state: FSMContext):
    await state.set_state(BookingStates.awaiting_time)
    lang = await _get_user_lang(callback.from_user)
    await callback.message.answer(t("booking.ask_time_new", lang))
    await callback.answer()


@router.callback_query(BookingStates.confirming, F.data == "confirm:submit")
async def submit_booking(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = await _get_user_lang(callback.from_user)
    if data.get("submitted"):
        await callback.answer(t("booking.already_submitting", lang))
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
            f"{t('booking.insufficient_points', lang)}\n"
            f"{t('booking.required', lang)}: {exc.required_points}, {t('booking.current', lang)}: {exc.current_balance}."
        )
        await callback.answer()
        return
    except (InvalidRideDateTimeError, ValueError):
        await state.update_data(submitted=False)
        await callback.message.answer(t("booking.invalid_datetime", lang))
        await callback.answer()
        return

    await state.clear()
    await callback.message.answer(
        f"{t('booking.created', lang)}\n"
        f"{t('booking.debited', lang)}: {booking.points_debited}\n"
        f"{t('booking.remaining', lang)}: {booking.points_balance_after}\n\n"
        + t("menu.welcome", lang),
        reply_markup=welcome_keyboard(lang),
    )
    await callback.answer(t("common.done", lang))


@router.callback_query(F.data == "confirm:submit")
async def duplicate_submit(callback: CallbackQuery):
    lang = await _get_user_lang(callback.from_user)
    await callback.answer(t("booking.already_processed", lang), show_alert=True)
