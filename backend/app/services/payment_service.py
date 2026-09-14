from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.points_transaction import PointsTransaction, PointsTransactionType
from app.models.user import User
from app.services.pricing_service import get_or_create_pricing

YOOKASSA_API = "https://api.yookassa.ru/v3"


class PaymentNotConfiguredError(Exception):
    pass


class PaymentService:
    def __init__(self, db_session: AsyncSession, http_client: httpx.AsyncClient | None = None):
        self.db_session = db_session
        self.http_client = http_client

    def _ensure_configured(self) -> None:
        if not settings.payments_enabled:
            raise PaymentNotConfiguredError("Payment provider is not configured")

    async def create_points_payment(
        self,
        *,
        user: User,
        points: int,
    ) -> dict:
        self._ensure_configured()
        pricing = await get_or_create_pricing(self.db_session)
        amount_rub = points * int(pricing.point_price_cents) / 100
        return_url = f"{settings.frontend_public_url.rstrip('/')}/profile?payment=success"
        idempotency_key = f"{user.user_id}-{points}-{int(time.time())}-{uuid.uuid4().hex[:8]}"

        auth = httpx.BasicAuth(settings.yookassa_shop_id, settings.yookassa_secret_key)
        payload = {
            "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": return_url},
            "description": f"Пополнение баллов ({points}) — user {user.user_id}",
            "metadata": {
                "user_id": str(user.user_id),
                "points": str(points),
            },
        }
        async with httpx.AsyncClient(auth=auth, timeout=30.0) as client:
            response = await client.post(
                f"{YOOKASSA_API}/payments",
                json=payload,
                headers={"Idempotence-Key": idempotency_key},
            )
            response.raise_for_status()
            return response.json()

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        if not settings.payment_webhook_secret.strip():
            return False
        expected = hmac.new(
            key=settings.payment_webhook_secret.encode("utf-8"),
            msg=body,
            digestmod=hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    async def handle_webhook(self, body: bytes, signature: str) -> None:
        if not self.verify_webhook_signature(body, signature):
            raise ValueError("invalid webhook signature")

        data = json.loads(body)
        if data.get("event") != "payment.succeeded":
            return

        payment_object = data.get("object") or {}
        metadata = payment_object.get("metadata") or {}
        user_id = str(metadata.get("user_id", "")).strip()
        points_raw = metadata.get("points")
        if not user_id or points_raw is None:
            raise ValueError("missing payment metadata")

        points = int(points_raw)
        user = await self.db_session.get(User, user_id)
        if user is None:
            raise ValueError("user not found")

        pricing = await get_or_create_pricing(self.db_session)
        eur_amount_cents = points * int(pricing.point_price_cents)
        user.points_balance = int(user.points_balance or 0) + points
        transaction = PointsTransaction(
            user_id=user.user_id,
            amount=points,
            transaction_type=PointsTransactionType.CARD_PURCHASE,
            eur_amount_cents=eur_amount_cents,
        )
        self.db_session.add(transaction)
        await self.db_session.commit()
