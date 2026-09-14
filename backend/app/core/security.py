from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any, Iterable
from urllib.parse import unquote, parse_qsl

from jose import jwt

from app.core.config import settings


def validate_tg_data(init_data: str) -> bool:
    """
    Проверяет валидность данных, полученных от Telegram Mini App.
    """
    try:
        # Секретный ключ для проверки генерируется из токена бота.
        secret_key = hmac.new(
            key=b"WebAppData",
            msg=settings.bot_token.encode(),
            digestmod=hashlib.sha256
        ).digest()

        # Декодируем и парсим строку initData в словарь.
        decoded_data = unquote(init_data)
        data_dict = dict(parse_qsl(decoded_data))
        
        # Хеш для проверки присылается Telegram.
        received_hash = data_dict.pop("hash")

        # Формируем строку для подписи из остальных данных.
        data_check_string = "\n".join(
            f"{key}={value}" for key, value in sorted(data_dict.items())
        )

        # Вычисляем подпись и сравниваем с присланной.
        calculated_hash = hmac.new(
            key=secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()

        return calculated_hash == received_hash
    except Exception:
        return False


def parse_tg_user_data(init_data: str) -> dict[str, Any] | None:
    if init_data.startswith("test:"):
        if not settings.allow_test_telegram_init_data:
            return None
        parts = init_data.split(":", 3)
        if len(parts) != 4:
            return None
        user_id, first_name, username = parts[1], parts[2], parts[3]
        return {"id": str(user_id), "first_name": first_name, "username": username}

    if not validate_tg_data(init_data):
        return None

    try:
        decoded_data = unquote(init_data)
        data = dict(parse_qsl(decoded_data))
        raw_user = data.get("user")
        if not raw_user:
            return None
        import json
        user_data = json.loads(raw_user)
        if not user_data.get("id"):
            return None
        return user_data
    except Exception:
        return None


def create_access_token(subject: Any, role: str) -> str:
    """
    Создает JWT access_token.
    
    :param subject: Идентификатор пользователя (или другие данные), который будет храниться в 'sub' claim.
    """
    expire = datetime.utcnow() + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode = {"exp": expire, "sub": str(subject), "role": role}
    encoded_jwt = jwt.encode(
        to_encode, settings.secret_key, algorithm=settings.algorithm
    )
    return encoded_jwt


def hash_admin_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_admin_key(role: str) -> str:
    return f"ride_{role}_{secrets.token_urlsafe(24)}"


def generate_driver_key() -> str:
    return f"ride_driver_{secrets.token_urlsafe(24)}"


def create_admin_session_token(*, admin_key_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=settings.admin_session_ttl_hours)
    payload = {"exp": expire, "admin_key_id": admin_key_id, "role": role}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_admin_session_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if "admin_key_id" not in payload or "role" not in payload:
        raise ValueError("Invalid admin session token payload.")
    return payload


def create_driver_session_token(*, driver_id: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=settings.driver_session_ttl_hours)
    payload = {"exp": expire, "driver_id": driver_id}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_driver_session_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if "driver_id" not in payload:
        raise ValueError("Invalid driver session token payload.")
    return payload


DRIVER_ENTER_TOKEN_PURPOSE = "driver_enter"
DRIVER_ENTER_TOKEN_TTL_SECONDS = 86400


def create_permanent_driver_enter_token(*, driver_id: str) -> str:
    """Short-lived, single-use cabinet enter link for a driver."""
    expire = datetime.utcnow() + timedelta(seconds=DRIVER_ENTER_TOKEN_TTL_SECONDS)
    payload = {
        "purpose": DRIVER_ENTER_TOKEN_PURPOSE,
        "driver_id": driver_id,
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_permanent_driver_enter_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.algorithm],
        options={"verify_exp": True},
    )
    if payload.get("purpose") != DRIVER_ENTER_TOKEN_PURPOSE:
        raise ValueError("Invalid driver enter token purpose.")
    driver_id = str(payload.get("driver_id", "")).strip()
    if not driver_id:
        raise ValueError("Invalid driver enter token payload.")
    return payload


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def has_any_role(token_payload: dict[str, Any], allowed_roles: Iterable[str]) -> bool:
    token_role = str(token_payload.get("role", "")).strip().lower()
    return token_role in {role.lower() for role in allowed_roles}
