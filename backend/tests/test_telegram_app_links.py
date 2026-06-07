from app.services.telegram_app_links import build_driver_cabinet_url, build_telegram_mini_app_url


def test_build_telegram_mini_app_url_without_startapp():
    assert build_telegram_mini_app_url() == "https://t.me/rideminiapp_bot/ride"


def test_build_driver_cabinet_url_points_to_web_driver_page():
    url = build_driver_cabinet_url()
    assert url == "https://ride.leandoer.online/driver"
