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
