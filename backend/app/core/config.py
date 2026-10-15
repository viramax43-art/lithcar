from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_db: str = Field(default="lithcar")
    postgres_user: str = Field(default="user")
    postgres_password: str = Field(default="password")

    database_url: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/lithcar"
    )
    redis_url: str = Field(default="redis://localhost:6379")

    bot_token: str = Field(default="")
    telegram_bot_polling_enabled: bool = Field(default=True)
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    environment: str = Field(default="development")
    trusted_hosts: str = Field(default="localhost,127.0.0.1")
    debug: bool = Field(default=False)
    frontend_cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")
    public_base_url: str = Field(default="http://localhost:8000")
    telegram_mini_app_url: str = Field(default="https://t.me/rideminiapp_bot/ride")
    frontend_public_url: str = Field(default="https://ride.leandoer.online")
    allow_test_telegram_init_data: bool = Field(default=False)

    passenger_access_cookie_name: str = Field(default="ride_access_token")
    passenger_refresh_cookie_name: str = Field(default="ride_refresh_token")
    passenger_session_cookie_secure: bool = Field(default=False)

    admin_session_cookie_name: str = Field(default="ride_admin_session")
    admin_session_ttl_hours: int = Field(default=24 * 7)
    admin_session_cookie_secure: bool = Field(default=False)
    driver_session_cookie_name: str = Field(default="ride_driver_session")
    driver_session_ttl_hours: int = Field(default=24 * 7)
    driver_online_ttl_seconds: int = Field(default=45)
    chief_admin_key: str = Field(default="")
    s3_endpoint_url: str = Field(default="http://localhost:9000")
    s3_access_key_id: str = Field(default="minioadmin")
    s3_secret_access_key: str = Field(default="minioadmin")
    s3_bucket_name: str = Field(default="driver-photos")
    s3_region: str = Field(default="us-east-1")
    s3_force_path_style: bool = Field(default=True)
    s3_required_on_startup: bool = Field(default=True)

    osrm_base_url: str = Field(default="https://router.project-osrm.org")

    # --- Жизненный цикл поездки: «Еду на точку» / «Прибыл» / ожидание / неявка ---
    # Насколько заранее водитель может нажать «Еду на точку» (защита от ложного «уже едет»).
    # 6 часов: отсекаем «еду» за сутки до подачи, но не мешаем плановым поездкам на день.
    ride_en_route_max_early_minutes: int = Field(default=360)
    # Окно, в котором водитель может откатить ошибочно нажатый статус.
    ride_status_undo_window_minutes: int = Field(default=5)
    # Радиус (м), считающийся «прибыл на точку» — используется для подсказок и разбора споров.
    ride_arrival_radius_meters: int = Field(default=400)
    # Через сколько минут ожидания пассажиру напомнить, что водитель ждёт.
    ride_wait_reminder_minutes: int = Field(default=7)
    # Минимальное ожидание на точке, после которого водитель может оформить неявку.
    ride_no_show_min_wait_minutes: int = Field(default=5)
    # Насколько позже назначенного времени напомнить водителю о старте поездки.
    ride_driver_late_reminder_minutes: int = Field(default=15)
    # Если водитель «едет на точку» дольше этого времени — поездка уходит админу на контроль.
    ride_en_route_timeout_minutes: int = Field(default=90)
    # Если поездка длится дольше этого времени — поездка уходит админу на контроль.
    ride_max_duration_minutes: int = Field(default=360)
    # Чат поездки: ограничения, антиспам и кулдаун кнопки «Где вы?».
    ride_chat_max_length: int = Field(default=1000)
    ride_chat_rate_limit_messages: int = Field(default=20)
    ride_chat_rate_limit_window_seconds: int = Field(default=60)
    ride_nudge_cooldown_seconds: int = Field(default=180)
    # Как часто фоновый сторож проверяет «зависшие» поездки и напоминания.
    ride_watchdog_interval_seconds: int = Field(default=60)
    ride_watchdog_enabled: bool = Field(default=True)

    # --- «Поездка состоялась?» ----------------------------------------------------
    # Водитель начал поездку, но не нажал «Завершил». Через расчётное время в пути,
    # умноженное на этот коэффициент, пассажиру уходит вопрос с кнопками «Да / Нет».
    ride_completion_check_factor: float = Field(default=2.0)
    # Нижняя граница ожидания: на коротких поездках не дёргаем пассажира раньше этого времени.
    ride_completion_check_min_minutes: int = Field(default=20)
    # Верхняя граница: дальше этого порога вопрос не откладываем (страховка от «маршрута на сутки»).
    ride_completion_check_max_minutes: int = Field(default=360)
    # Если маршрутной оценки нет — считаем время по прямой дистанции и этой средней скорости.
    ride_completion_check_speed_kmh: float = Field(default=45.0)
    # Совсем нет данных о маршруте — берём это время по умолчанию.
    ride_completion_check_fallback_minutes: int = Field(default=60)
    # Сколько ждём ответ пассажира, прежде чем подключить администратора.
    ride_completion_check_escalate_minutes: int = Field(default=60)

    payment_provider: str = Field(default="")
    yookassa_shop_id: str = Field(default="")
    yookassa_secret_key: str = Field(default="")
    payment_webhook_secret: str = Field(default="")

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def frontend_cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_cors_origins.split(",") if origin.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]

    @property
    def payments_enabled(self) -> bool:
        return (
            self.payment_provider.strip().lower() == "yookassa"
            and bool(self.yookassa_shop_id.strip())
            and bool(self.yookassa_secret_key.strip())
        )

    @model_validator(mode="after")
    def _guard_test_auth(self) -> "Settings":
        if self.allow_test_telegram_init_data and self.is_production:
            raise RuntimeError(
                "ALLOW_TEST_TELEGRAM_INIT_DATA must be False in production"
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
