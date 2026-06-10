from __future__ import annotations

from typing import Any

from app.models.user import DEFAULT_USER_LANGUAGE, SUPPORTED_USER_LANGUAGES

UserInfoTextI18n = dict[str, str]

EMPTY_USER_INFO_TEXT: UserInfoTextI18n = {lang: "" for lang in SUPPORTED_USER_LANGUAGES}


def normalize_user_info_text_i18n(raw: Any) -> UserInfoTextI18n:
    if raw is None:
        return dict(EMPTY_USER_INFO_TEXT)

    if isinstance(raw, str):
        text = raw.strip()
        result = dict(EMPTY_USER_INFO_TEXT)
        if text:
            result[DEFAULT_USER_LANGUAGE] = text
        return result

    if isinstance(raw, dict):
        return {
            lang: str(raw.get(lang) or "").strip()
            for lang in SUPPORTED_USER_LANGUAGES
        }

    return dict(EMPTY_USER_INFO_TEXT)


def has_user_info_text(texts: UserInfoTextI18n | None) -> bool:
    normalized = normalize_user_info_text_i18n(texts)
    return any(normalized.get(lang) for lang in SUPPORTED_USER_LANGUAGES)


def resolve_user_info_text(texts: UserInfoTextI18n | None, language: str | None) -> str:
    normalized = normalize_user_info_text_i18n(texts)
    lang = language if language in SUPPORTED_USER_LANGUAGES else DEFAULT_USER_LANGUAGE
    if normalized.get(lang):
        return normalized[lang]
    for fallback in (DEFAULT_USER_LANGUAGE, "en", "ru", "pl"):
        if normalized.get(fallback):
            return normalized[fallback]
    return ""
