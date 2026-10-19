from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Sequence, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import Base


class RideRequestStatus:
    PENDING = "pending"
    GROUPED = "grouped"
    ASSIGNED = "assigned"
    EN_ROUTE_TO_PICKUP = "en_route_to_pickup"
    AWAITING_PASSENGER = "awaiting_passenger"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    # В терминальных статусах менять состояние нельзя, только читать историю.
    TERMINAL: tuple[str, ...] = (COMPLETED, CANCELLED)
    # В этих статусах чат поездки открыт: стороны могут писать друг другу.
    CHAT_OPEN: tuple[str, ...] = (ASSIGNED, EN_ROUTE_TO_PICKUP, AWAITING_PASSENGER, IN_PROGRESS)
    # Водитель может отменить поездку (в т.ч. зафиксировать неявку) только до посадки.
    DRIVER_CANCELLABLE: tuple[str, ...] = (ASSIGNED, EN_ROUTE_TO_PICKUP, AWAITING_PASSENGER)
    # Пассажир может отменить сам до старта поездки; после старта — только через администратора.
    PASSENGER_CANCELLABLE: tuple[str, ...] = (PENDING, GROUPED, ASSIGNED, EN_ROUTE_TO_PICKUP)
    ACTIVE: tuple[str, ...] = (ASSIGNED, EN_ROUTE_TO_PICKUP, AWAITING_PASSENGER, IN_PROGRESS)

    DRIVER_FLOW_NEXT: dict[str, str] = {
        ASSIGNED: EN_ROUTE_TO_PICKUP,
        EN_ROUTE_TO_PICKUP: AWAITING_PASSENGER,
        AWAITING_PASSENGER: IN_PROGRESS,
        IN_PROGRESS: COMPLETED,
    }

    @classmethod
    def can_driver_transition(cls, current: str, target: str) -> bool:
        return cls.DRIVER_FLOW_NEXT.get(current) == target

    @classmethod
    def is_terminal(cls, status: str) -> bool:
        return status in cls.TERMINAL


class RideCancelReason:
    """Причины отмены поездки — хранятся в `cancel_reason` и попадают в уведомления/аудит."""

    PASSENGER_CANCELLED = "passenger_cancelled"
    PASSENGER_LATE_CANCELLED = "passenger_late_cancelled"
    DRIVER_CANCELLED = "driver_cancelled"
    DRIVER_NO_SHOW = "driver_no_show"
    ADMIN_CANCELLED = "admin_cancelled"
    # Пассажир сразу после старта сообщил, что на самом деле не в машине
    # (водитель нажал «Начать поездку» случайно). Отмена с полным возвратом.
    PASSENGER_DISPUTE_START = "passenger_dispute_start"
    # Авто-отмена сторожем: водитель не выехал/не прибыл вовремя.
    SYSTEM_DRIVER_LATE = "system_driver_late"
    # Авто-отмена сторожем: пассажир не вышел за максимальное время ожидания.
    SYSTEM_NO_SHOW = "system_no_show"

    ALL: tuple[str, ...] = (
        PASSENGER_CANCELLED,
        PASSENGER_LATE_CANCELLED,
        DRIVER_CANCELLED,
        DRIVER_NO_SHOW,
        ADMIN_CANCELLED,
        PASSENGER_DISPUTE_START,
        SYSTEM_DRIVER_LATE,
        SYSTEM_NO_SHOW,
    )


class RideAdminAttentionReason:
    """Почему поездка попала в «требует внимания администратора»."""

    DRIVER_LATE = "driver_late"
    EN_ROUTE_TOO_LONG = "en_route_too_long"
    WAITING_TOO_LONG = "waiting_too_long"
    RIDE_TOO_LONG = "ride_too_long"
    NO_SHOW = "no_show"
    ARRIVAL_FAR_FROM_PICKUP = "arrival_far_from_pickup"
    # Водитель не нажал «Завершил», а пассажир ответил «Нет» на вопрос «Поездка состоялась?».
    PASSENGER_NOT_COMPLETED = "passenger_not_completed"
    # Пассажир не ответил на вопрос «Поездка состоялась?» — статус поездки всё ещё «в пути».
    COMPLETION_UNCONFIRMED = "completion_unconfirmed"
    # Пассажир заявил «поездка не начиналась» сразу после старта.
    PASSENGER_START_DISPUTE = "passenger_start_dispute"
    # Водитель отказался от поездки уже после назначения — пассажиру полный возврат.
    DRIVER_CANCELLED = "driver_cancelled"
    # Водитель нажал «Завершил» далеко от точки высадки.
    COMPLETION_FAR_FROM_DESTINATION = "completion_far_from_destination"
    # Поездка закрыта автоматически сторожем (не хватило реакции сторон).
    AUTO_RESOLVED = "auto_resolved"


class RideRequest(Base):
    __tablename__ = "ride_requests"

    ride_number_seq = Sequence("ride_requests_ride_number_seq")

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    ride_number = Column(
        Integer,
        ride_number_seq,
        server_default=ride_number_seq.next_value(),
        nullable=False,
        unique=True,
        index=True,
    )
    passenger_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    passenger_name = Column(String, nullable=False)
    from_address = Column(String, nullable=False)
    from_lat = Column(Float, nullable=False)
    from_lng = Column(Float, nullable=False)
    to_address = Column(String, nullable=False)
    to_lat = Column(Float, nullable=False)
    to_lng = Column(Float, nullable=False)
    date_time = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String, nullable=False, server_default=RideRequestStatus.PENDING, index=True)
    group_id = Column(String, nullable=True, index=True)
    driver_id = Column(String, ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, index=True)
    offer_id = Column(String, ForeignKey("driver_ride_offers.id", ondelete="SET NULL"), nullable=True, index=True)
    passenger_number = Column(Integer, nullable=True)
    pickup_changed_by_driver = Column(Boolean, nullable=False, server_default="false")
    pickup_notified_at = Column(DateTime(timezone=True), nullable=True)
    pickup_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    pickup_revision = Column(Integer, nullable=False, server_default="0")
    original_from_address = Column(String, nullable=True)
    original_from_lat = Column(Float, nullable=True)
    original_from_lng = Column(Float, nullable=True)
    quoted_points = Column(Integer, nullable=True)
    quoted_price_cents = Column(Integer, nullable=True)
    quote_road_km = Column(Float, nullable=True)
    quote_straight_km = Column(Float, nullable=True)
    quote_circuity = Column(Float, nullable=True)
    quote_duration_min = Column(Float, nullable=True)
    quote_tier_label = Column(String, nullable=True)
    quote_breakdown_json = Column(JSONB, nullable=True)
    payment_method = Column(String, nullable=False, server_default="points")
    passenger_live_lat = Column(Float, nullable=True)
    passenger_live_lng = Column(Float, nullable=True)
    passenger_live_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    # --- Жизненный цикл «Еду на точку» / «Прибыл» ---------------------------------
    # Факты (когда реально произошло) отделены от статуса: по ним считаются таймеры,
    # SLA и разбор спорных ситуаций, а сам статус можно откатить в окне undo.
    en_route_at = Column(DateTime(timezone=True), nullable=True)
    arrived_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    status_updated_at = Column(DateTime(timezone=True), nullable=True, index=True)
    # Пассажир подтвердил «я на месте» — сильно снижает риск неявки.
    passenger_ready_at = Column(DateTime(timezone=True), nullable=True)
    # Пассажир подтвердил, что сел в машину (после старта это ещё и защита от
    # случайного нажатия «Начать поездку» со стороны водителя).
    passenger_boarded_at = Column(DateTime(timezone=True), nullable=True)
    # Расстояние от водителя до точки подачи в момент «Прибыл» (для разбора споров).
    arrival_distance_m = Column(Float, nullable=True)
    # Расстояние от водителя до точки высадки в момент «Завершил» (для разбора споров).
    completion_distance_m = Column(Float, nullable=True)
    # Однократные отметки, чтобы не спамить участников напоминаниями.
    arrival_reminder_sent_at = Column(DateTime(timezone=True), nullable=True)
    no_show_available_notified_at = Column(DateTime(timezone=True), nullable=True)
    driver_late_reminded_at = Column(DateTime(timezone=True), nullable=True)
    nudge_sent_at = Column(DateTime(timezone=True), nullable=True)
    # Продление ожидания на точке: даётся один раз, чтобы не держать водителя бесконечно.
    wait_extended_at = Column(DateTime(timezone=True), nullable=True)
    wait_extended_until = Column(DateTime(timezone=True), nullable=True)
    # Админ-контроль спорных поездок (водитель опаздывает, статус «завис» и т.п.).
    admin_attention_at = Column(DateTime(timezone=True), nullable=True)
    admin_attention_reason = Column(String, nullable=True)
    # Пассажир заявил «поездка не начиналась» сразу после старта.
    dispute_at = Column(DateTime(timezone=True), nullable=True)
    dispute_reason = Column(String, nullable=True)
    # Автоматическое закрытие сторожем: чтобы не трогать поездку дважды и было видно, почему.
    auto_resolved_at = Column(DateTime(timezone=True), nullable=True)
    auto_resolve_reason = Column(String, nullable=True)
    # --- Финансы отмены ----------------------------------------------------------
    # Баллы списываются при бронировании (эскроу). При отмене/неявке часть
    # возвращается пассажиру, часть может уйти водителю как компенсация.
    refunded_at = Column(DateTime(timezone=True), nullable=True)
    refund_points = Column(Integer, nullable=True)
    driver_compensation_points = Column(Integer, nullable=True)
    settlement_reason = Column(String, nullable=True)
    # --- «Поездка состоялась?» ---------------------------------------------------

    # Водитель нажал «Начал поездку», но не нажал «Завершил»: система оценивает время
    # в пути, умножает его и спрашивает пассажира. Ответ попадает в эти поля.
    completion_check_at = Column(DateTime(timezone=True), nullable=True)
    completion_check_result = Column(String, nullable=True)  # confirmed | declined
    completion_check_answered_at = Column(DateTime(timezone=True), nullable=True)
    completion_check_reminded_at = Column(DateTime(timezone=True), nullable=True)
    completion_check_escalated_at = Column(DateTime(timezone=True), nullable=True)
    # Отмена: кто, почему и (опционально) комментарий стороны.
    cancelled_by = Column(String, nullable=True)
    cancel_reason = Column(String, nullable=True)
    cancel_comment = Column(String, nullable=True)
