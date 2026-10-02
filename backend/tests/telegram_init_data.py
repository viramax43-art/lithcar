from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

# Mirrors conftest.py / .env.test so tests can sign initData exactly like Telegram does.
TEST_BOT_TOKEN = "test-bot-token"


def make_signed_init_data(
    *,
    user_id: str,
    username: str | None = None,
    bot_token: str = TEST_BOT_TOKEN,
    extra: dict[str, str] | None = None,
) -> str:
    """
    Генерирует валидную строку initData для validate_tg_data().
    Формат/хеширование соответствует app.core.security.validate_tg_data.
    """
    user_payload = {"id": int(user_id)}
    if username is not None:
        user_payload["username"] = username

    data: dict[str, str] = {
        "auth_date": str(int(time.time())),
        "query_id": "test-query-id",
        "user": json.dumps(user_payload, separators=(",", ":")),
    }
    if extra:
        data.update(extra)

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode(),
        digestmod=hashlib.sha256,
    ).digest()

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    data["hash"] = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    # Важно: user содержит JSON, поэтому должен быть корректно url-encoded
    return urlencode(data)
