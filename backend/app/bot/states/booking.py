from aiogram.fsm.state import State, StatesGroup


class BookingStates(StatesGroup):
    awaiting_from_location = State()
    awaiting_to_location = State()
    awaiting_date = State()
    awaiting_time = State()
    confirming = State()
