from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.geo_service import haversine_km, point_in_polygon
from app.services.pricing_service import ride_price_eur
from app.services.suggestion_service import _similarity_score_from_distances


def test_point_in_polygon_and_haversine():
    polygon = [
        {"lat": 54.72, "lng": 25.22},
        {"lat": 54.72, "lng": 25.34},
        {"lat": 54.65, "lng": 25.34},
        {"lat": 54.65, "lng": 25.22},
    ]
    assert point_in_polygon(54.69, 25.28, polygon) is True
    assert point_in_polygon(55.0, 26.0, polygon) is False

    d = haversine_km(54.6872, 25.2797, 54.7000, 25.3000)
    assert d > 0
    assert d < 5


def test_pricing_formula():
    assert ride_price_eur(points_per_ride=10, point_price_cents=50) == 5.0
    assert ride_price_eur(points_per_ride=12, point_price_cents=80) == 9.6


def test_suggestion_similarity():
    now = datetime.now(timezone.utc)
    first = SimpleNamespace(
        from_lat=54.691,
        from_lng=25.271,
        to_lat=54.700,
        to_lng=25.280,
        date_time=now,
    )
    second = SimpleNamespace(
        from_lat=54.692,
        from_lng=25.272,
        to_lat=54.701,
        to_lng=25.281,
        date_time=now + timedelta(minutes=15),
    )
    third = SimpleNamespace(
        from_lat=55.200,
        from_lng=26.000,
        to_lat=55.300,
        to_lng=26.100,
        date_time=now + timedelta(hours=4),
    )

    from_dist_close = haversine_km(first.from_lat, first.from_lng, second.from_lat, second.from_lng)
    to_dist_close = haversine_km(first.to_lat, first.to_lng, second.to_lat, second.to_lng)
    close_score = _similarity_score_from_distances(from_dist_close, to_dist_close, first, second)

    from_dist_far = haversine_km(first.from_lat, first.from_lng, third.from_lat, third.from_lng)
    to_dist_far = haversine_km(first.to_lat, first.to_lng, third.to_lat, third.to_lng)
    far_score = _similarity_score_from_distances(from_dist_far, to_dist_far, first, third)

    assert close_score > far_score
    assert close_score >= 60
