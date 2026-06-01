from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, func

from app.models import Base


class UserRole:
    PASSENGER = "passenger"
    ADMIN = "admin"
    DRIVER = "driver"
    MODERATOR = "moderator"


class UserLanguage:
    LITHUANIAN = "lt"
    POLISH = "pl"
    ENGLISH = "en"
    RUSSIAN = "ru"
    LT = LITHUANIAN
    PL = POLISH
    EN = ENGLISH
    RU = RUSSIAN


SUPPORTED_USER_LANGUAGES = frozenset(
    {
        UserLanguage.LITHUANIAN,
        UserLanguage.POLISH,
        UserLanguage.ENGLISH,
        UserLanguage.RUSSIAN,
    }
)
DEFAULT_USER_LANGUAGE = UserLanguage.LITHUANIAN


class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True)
    username = Column(String, nullable=True)
    role = Column(String, nullable=False, server_default=UserRole.PASSENGER)
    language = Column(String(8), nullable=False, server_default=DEFAULT_USER_LANGUAGE)
    points_balance = Column(Integer, nullable=False, server_default="0")
    rating = Column(Float, nullable=False, server_default="5.0")
    onboarding_completed = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    @property
    def preferred_language(self) -> str:
        return self.language

    @preferred_language.setter
    def preferred_language(self, value: str) -> None:
        self.language = value

    def __str__(self) -> str:
        return f"{self.user_id} ({self.role})"


