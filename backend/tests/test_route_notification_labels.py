"""Unit tests for route-change notification A/B labels."""
from __future__ import annotations

from app.services.ride_route_notification_service import _point_label, _route_change_header
from app.services.ride_route_update_service import RouteChangeActor


def test_admin_pickup_header_contains_point_a_ru():
    header = _route_change_header(RouteChangeActor.ADMIN, "from", "ru")
    assert "A" in header
    assert "подач" in header.lower()


def test_admin_dropoff_header_contains_point_b_ru():
    header = _route_change_header(RouteChangeActor.ADMIN, "to", "ru")
    assert "B" in header
    assert "назначен" in header.lower()


def test_passenger_pickup_header_contains_point_a_ru():
    header = _route_change_header(RouteChangeActor.PASSENGER, "from", "ru")
    assert "A" in header
    assert "Пассажир" in header


def test_point_label_from_is_point_a_ru():
    assert _point_label("ru", "from") == "Точка A"


def test_point_label_to_is_point_b_ru():
    assert _point_label("ru", "to") == "Точка B"
