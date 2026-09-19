class RidePaymentMethod:
    POINTS = "points"
    DRIVER_CASH = "driver_cash"
    DRIVER_CARD = "driver_card"

    ALL = frozenset({POINTS, DRIVER_CASH, DRIVER_CARD})

    @classmethod
    def normalize(cls, value: str | None) -> str:
        normalized = (value or cls.POINTS).strip().lower()
        if normalized not in cls.ALL:
            return cls.POINTS
        return normalized

    @classmethod
    def is_pay_driver_on_fact(cls, value: str | None) -> bool:
        normalized = cls.normalize(value)
        return normalized in {cls.DRIVER_CASH, cls.DRIVER_CARD}
