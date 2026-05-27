from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from app.bot.handlers.booking import router as booking_router
from app.bot.handlers.pickup_confirm import router as pickup_confirm_router
from app.core.config import settings


logger = logging.getLogger(__name__)


async def start_bot() -> None:
    if not settings.telegram_bot_polling_enabled:
        logger.info("Telegram bot polling is disabled by config.")
        return
    if not settings.bot_token:
        raise RuntimeError("BOT_TOKEN is empty. Bot cannot start.")

    bot = Bot(token=settings.bot_token)
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(booking_router)
    dispatcher.include_router(pickup_confirm_router)

    logger.info("Telegram bot polling started.")
    await dispatcher.start_polling(bot, allowed_updates=dispatcher.resolve_used_update_types())


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_bot())


if __name__ == "__main__":
    main()
