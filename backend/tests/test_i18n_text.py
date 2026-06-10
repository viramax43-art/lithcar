from app.core.i18n_text import has_user_info_text, normalize_user_info_text_i18n, resolve_user_info_text


def test_normalize_user_info_text_from_legacy_string():
    result = normalize_user_info_text_i18n("Hello")
    assert result["lt"] == "Hello"
    assert result["en"] == ""


def test_normalize_user_info_text_from_dict():
    result = normalize_user_info_text_i18n({"lt": "Labas", "en": "Hello"})
    assert result["lt"] == "Labas"
    assert result["en"] == "Hello"
    assert result["ru"] == ""


def test_resolve_user_info_text_prefers_requested_language():
    texts = normalize_user_info_text_i18n({"lt": "Labas", "en": "Hello", "ru": "Привет"})
    assert resolve_user_info_text(texts, "en") == "Hello"
    assert resolve_user_info_text(texts, "ru") == "Привет"


def test_has_user_info_text_requires_non_empty_value():
    assert has_user_info_text({"lt": "Labas"}) is True
    assert has_user_info_text({"lt": "", "en": ""}) is False


def test_resolve_user_info_text_falls_back_to_lt():
    texts = normalize_user_info_text_i18n({"lt": "Labas"})
    assert resolve_user_info_text(texts, "pl") == "Labas"
