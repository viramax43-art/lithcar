from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)


CANCEL_LABEL = "Отмена"


def welcome_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📱 Открыть Mini App", url="https://t.me/rideminiapp_bot/ride")],
            [InlineKeyboardButton(text="🤖 Оформить через бота", callback_data="start_bot_booking")],
        ]
    )


def location_keyboard(*, label: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=label, request_location=True)],
            [KeyboardButton(text=CANCEL_LABEL)],
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def remove_keyboard() -> ReplyKeyboardRemove:
    return ReplyKeyboardRemove()


def date_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Сегодня", callback_data="date:today"),
                InlineKeyboardButton(text="Завтра", callback_data="date:tomorrow"),
            ],
            [InlineKeyboardButton(text="Ввести вручную", callback_data="date:manual")],
        ]
    )


def time_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="+30 мин", callback_data="time:plus30"),
                InlineKeyboardButton(text="+1 час", callback_data="time:plus60"),
            ],
            [InlineKeyboardButton(text="Ввести вручную", callback_data="time:manual")],
        ]
    )


def confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Подтвердить поездку", callback_data="confirm:submit")],
            [InlineKeyboardButton(text="Изменить", callback_data="confirm:edit")],
            [InlineKeyboardButton(text="Отмена", callback_data="confirm:cancel")],
        ]
    )


def edit_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Точка A", callback_data="edit:from"),
                InlineKeyboardButton(text="Точка B", callback_data="edit:to"),
            ],
            [
                InlineKeyboardButton(text="Дата", callback_data="edit:date"),
                InlineKeyboardButton(text="Время", callback_data="edit:time"),
            ],
            [InlineKeyboardButton(text="Назад к подтверждению", callback_data="edit:back")],
        ]
    )
