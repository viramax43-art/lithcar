from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
)

from app.bot.i18n import t


def welcome_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=t("menu.open_mini_app", lang), url="https://t.me/rideminiapp_bot/ride")],
            [InlineKeyboardButton(text=t("menu.book_in_bot", lang), callback_data="start_bot_booking")],
            [InlineKeyboardButton(text=t("menu.change_language", lang), callback_data="language:choose")],
        ]
    )


def confirm_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=t("menu.confirm_ride", lang), callback_data="confirm:submit")],
            [InlineKeyboardButton(text=t("menu.edit", lang), callback_data="confirm:edit")],
            [InlineKeyboardButton(text=t("menu.cancel", lang), callback_data="confirm:cancel")],
        ]
    )


def edit_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=t("booking.pointA", lang), callback_data="edit:from"),
                InlineKeyboardButton(text=t("booking.pointB", lang), callback_data="edit:to"),
            ],
            [
                InlineKeyboardButton(text=t("booking.datetime_date", lang), callback_data="edit:date"),
                InlineKeyboardButton(text=t("booking.datetime_time", lang), callback_data="edit:time"),
            ],
            [InlineKeyboardButton(text=t("menu.back_to_confirm", lang), callback_data="edit:back")],
        ]
    )
