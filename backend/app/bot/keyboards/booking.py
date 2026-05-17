from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
)


CANCEL_LABEL = "Отмена"


def welcome_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📱 Открыть Mini App", url="https://t.me/rideminiapp_bot/ride")],
            [InlineKeyboardButton(text="🤖 Оформить через бота", callback_data="start_bot_booking")],
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
