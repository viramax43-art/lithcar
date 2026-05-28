"""dynamic pricing settings and ride quote snapshot

Revision ID: 20260528_0017
Revises: 20260528_0016
Create Date: 2026-05-28 12:00:00.000000
"""

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260528_0017"
down_revision = "20260528_0016"
branch_labels = None
depends_on = None

DEFAULT_FORMULA = {
    "version": 1,
    "basePriceCents": 200,
    "pricePerKmCents": 12,
    "pricePerMinuteCents": 4,
    "circuityFreeThreshold": 1.10,
    "circuityPenaltyPerStepCents": 8,
    "minPriceCents": 300,
    "maxPriceCents": 2500,
    "minPoints": 1,
    "requireOsrm": False,
    "fallbackSpeedKmh": 35.0,
    "tiers": [
        {
            "maxCircuity": 1.12,
            "distanceMultiplier": 1.0,
            "minuteMultiplier": 1.0,
            "label": "Прямой",
        },
        {
            "maxCircuity": 1.30,
            "distanceMultiplier": 1.15,
            "minuteMultiplier": 1.1,
            "label": "Смешанный",
        },
        {
            "maxCircuity": 999.0,
            "distanceMultiplier": 1.35,
            "minuteMultiplier": 1.25,
            "label": "Городской",
        },
    ],
}


def upgrade() -> None:
    op.add_column(
        "pricing_settings",
        sa.Column("pricing_mode", sa.String(), nullable=False, server_default="fixed"),
    )
    formula_literal = json.dumps(DEFAULT_FORMULA).replace("'", "''")
    op.add_column(
        "pricing_settings",
        sa.Column(
            "pricing_formula_json",
            JSONB(),
            nullable=False,
            server_default=sa.text(f"'{formula_literal}'::jsonb"),
        ),
    )

    op.add_column("ride_requests", sa.Column("quoted_points", sa.Integer(), nullable=True))
    op.add_column("ride_requests", sa.Column("quoted_price_cents", sa.Integer(), nullable=True))
    op.add_column("ride_requests", sa.Column("quote_road_km", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("quote_straight_km", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("quote_circuity", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("quote_duration_min", sa.Float(), nullable=True))
    op.add_column("ride_requests", sa.Column("quote_tier_label", sa.String(), nullable=True))
    op.add_column(
        "ride_requests",
        sa.Column("quote_breakdown_json", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ride_requests", "quote_breakdown_json")
    op.drop_column("ride_requests", "quote_tier_label")
    op.drop_column("ride_requests", "quote_duration_min")
    op.drop_column("ride_requests", "quote_circuity")
    op.drop_column("ride_requests", "quote_straight_km")
    op.drop_column("ride_requests", "quote_road_km")
    op.drop_column("ride_requests", "quoted_price_cents")
    op.drop_column("ride_requests", "quoted_points")
    op.drop_column("pricing_settings", "pricing_formula_json")
    op.drop_column("pricing_settings", "pricing_mode")
