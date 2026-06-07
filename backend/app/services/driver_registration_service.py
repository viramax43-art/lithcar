from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.i18n_text import EMPTY_USER_INFO_TEXT, normalize_user_info_text_i18n
from app.models.driver_application import DriverApplication, DriverApplicationStatus
from app.models.driver_registration_settings import DriverRegistrationSettings
from app.models.user import DEFAULT_USER_LANGUAGE, SUPPORTED_USER_LANGUAGES, User
from app.services.driver_service import create_driver, get_driver, get_driver_by_user_id

DRIVER_FIELD_BINDINGS = frozenset(
    {
        "name",
        "carBrand",
        "carModel",
        "carPlate",
        "vehicleColor",
        "seatsCount",
        "licenseNumber",
        "about",
        "photo",
    }
)

FIELD_TYPES = frozenset({"text", "textarea", "file"})

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024


def default_form_schema() -> dict[str, Any]:
    return {
        "introText": dict(EMPTY_USER_INFO_TEXT),
        "fields": [
            {
                "id": "full_name",
                "type": "text",
                "required": True,
                "order": 0,
                "label": {
                    "lt": "Vardas ir pavarde",
                    "pl": "Imie i nazwisko",
                    "en": "Full name",
                    "ru": "ФИО",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "name",
            },
            {
                "id": "car_brand",
                "type": "text",
                "required": True,
                "order": 1,
                "label": {
                    "lt": "Automobilio marke",
                    "pl": "Marka samochodu",
                    "en": "Car brand",
                    "ru": "Марка автомобиля",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "carBrand",
            },
            {
                "id": "car_model",
                "type": "text",
                "required": True,
                "order": 2,
                "label": {
                    "lt": "Automobilio modelis",
                    "pl": "Model samochodu",
                    "en": "Car model",
                    "ru": "Модель автомобиля",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "carModel",
            },
            {
                "id": "car_plate",
                "type": "text",
                "required": True,
                "order": 3,
                "label": {
                    "lt": "Valstybinis numeris",
                    "pl": "Numer rejestracyjny",
                    "en": "License plate",
                    "ru": "Госномер",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "carPlate",
            },
            {
                "id": "vehicle_color",
                "type": "text",
                "required": False,
                "order": 4,
                "label": {
                    "lt": "Spalva",
                    "pl": "Kolor",
                    "en": "Color",
                    "ru": "Цвет",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "vehicleColor",
            },
            {
                "id": "about",
                "type": "textarea",
                "required": False,
                "order": 5,
                "label": {
                    "lt": "Apie save",
                    "pl": "O sobie",
                    "en": "About you",
                    "ru": "О себе",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "about",
            },
            {
                "id": "driver_photo",
                "type": "file",
                "required": False,
                "order": 6,
                "label": {
                    "lt": "Nuotrauka",
                    "pl": "Zdjecie",
                    "en": "Photo",
                    "ru": "Фото",
                },
                "placeholder": dict(EMPTY_USER_INFO_TEXT),
                "helpText": dict(EMPTY_USER_INFO_TEXT),
                "driverField": "photo",
                "accept": "image/*",
            },
        ],
    }


def _normalize_i18n_field(raw: Any) -> dict[str, str]:
    return normalize_user_info_text_i18n(raw)


def normalize_form_field(raw: dict[str, Any]) -> dict[str, Any]:
    field_id = str(raw.get("id") or "").strip()
    if not field_id:
        raise ValueError("Field id is required.")

    field_type = str(raw.get("type") or "text").strip().lower()
    if field_type not in FIELD_TYPES:
        raise ValueError(f"Unsupported field type: {field_type}")

    driver_field = raw.get("driverField")
    if driver_field is not None:
        driver_field = str(driver_field).strip()
        if driver_field and driver_field not in DRIVER_FIELD_BINDINGS:
            raise ValueError(f"Unsupported driverField binding: {driver_field}")
        if not driver_field:
            driver_field = None

    label = _normalize_i18n_field(raw.get("label"))
    if not any(label.values()):
        raise ValueError(f"Field {field_id} must have at least one label.")

    result: dict[str, Any] = {
        "id": field_id,
        "type": field_type,
        "required": bool(raw.get("required", False)),
        "order": int(raw.get("order", 0)),
        "label": label,
        "placeholder": _normalize_i18n_field(raw.get("placeholder")),
        "helpText": _normalize_i18n_field(raw.get("helpText")),
        "driverField": driver_field,
    }
    if field_type == "file":
        result["accept"] = str(raw.get("accept") or "image/*,application/pdf").strip()
    return result


def normalize_form_schema(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw:
        return default_form_schema()

    intro_text = _normalize_i18n_field(raw.get("introText"))
    fields_raw = raw.get("fields")
    if not isinstance(fields_raw, list):
        fields_raw = []

    seen_ids: set[str] = set()
    fields: list[dict[str, Any]] = []
    for index, item in enumerate(fields_raw):
        if not isinstance(item, dict):
            continue
        field = normalize_form_field({**item, "order": item.get("order", index)})
        if field["id"] in seen_ids:
            raise ValueError(f"Duplicate field id: {field['id']}")
        seen_ids.add(field["id"])
        fields.append(field)

    fields.sort(key=lambda item: (item.get("order", 0), item.get("id", "")))
    return {"introText": intro_text, "fields": fields}


async def get_or_create_registration_settings(db_session: AsyncSession) -> DriverRegistrationSettings:
    settings_row = await db_session.get(DriverRegistrationSettings, 1)
    if settings_row is not None:
        return settings_row

    settings_row = DriverRegistrationSettings(id=1, form_schema_json=default_form_schema())
    db_session.add(settings_row)
    await db_session.commit()
    await db_session.refresh(settings_row)
    return settings_row


async def get_form_schema(db_session: AsyncSession) -> dict[str, Any]:
    settings_row = await get_or_create_registration_settings(db_session)
    return normalize_form_schema(settings_row.form_schema_json)


async def update_form_schema(db_session: AsyncSession, *, schema: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_form_schema(schema)
    settings_row = await get_or_create_registration_settings(db_session)
    settings_row.form_schema_json = normalized
    await db_session.commit()
    await db_session.refresh(settings_row)
    return normalized


def _validate_submission(
    *,
    schema: dict[str, Any],
    answers: dict[str, str],
    files: dict[str, dict[str, Any]],
) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    normalized_answers: dict[str, str] = {}
    normalized_files: dict[str, dict[str, Any]] = {}
    fields_by_id = {field["id"]: field for field in schema.get("fields", [])}

    for field_id, field in fields_by_id.items():
        field_type = field["type"]
        if field_type == "file":
            file_entry = files.get(field_id)
            if field.get("required") and not file_entry:
                raise HTTPException(status_code=400, detail=f"Field {field_id} is required.")
            if file_entry:
                object_key = str(file_entry.get("objectKey") or "").strip()
                if not object_key:
                    raise HTTPException(status_code=400, detail=f"Field {field_id} file is invalid.")
                size_bytes = int(file_entry.get("sizeBytes") or 0)
                if size_bytes > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(status_code=400, detail=f"Field {field_id} file exceeds 5MB limit.")
                normalized_files[field_id] = {
                    "objectKey": object_key,
                    "fileName": str(file_entry.get("fileName") or "file"),
                    "contentType": str(file_entry.get("contentType") or "application/octet-stream"),
                    "sizeBytes": size_bytes,
                }
        else:
            value = str(answers.get(field_id) or "").strip()
            if field.get("required") and not value:
                raise HTTPException(status_code=400, detail=f"Field {field_id} is required.")
            if value:
                normalized_answers[field_id] = value

    unknown_answer_keys = set(answers.keys()) - set(fields_by_id.keys())
    if unknown_answer_keys:
        raise HTTPException(status_code=400, detail="Unknown form fields in answers.")

    unknown_file_keys = set(files.keys()) - set(fields_by_id.keys())
    if unknown_file_keys:
        raise HTTPException(status_code=400, detail="Unknown form fields in files.")

    return normalized_answers, normalized_files


async def _active_driver_for_user(
    db_session: AsyncSession,
    *,
    user_id: str,
    application: DriverApplication | None = None,
):
    driver = await get_driver_by_user_id(db_session, user_id=user_id)
    if driver is not None:
        return driver
    if application is not None and application.created_driver_id:
        return await get_driver(db_session, driver_id=application.created_driver_id)
    return None


async def get_user_application(db_session: AsyncSession, *, user_id: str) -> DriverApplication | None:
    result = await db_session.execute(
        select(DriverApplication)
        .where(DriverApplication.user_id == user_id)
        .order_by(DriverApplication.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_user_application_for_portal(
    db_session: AsyncSession,
    *,
    user_id: str,
) -> DriverApplication | None:
    """Hide stale approved applications when the driver profile was removed."""
    application = await get_user_application(db_session, user_id=user_id)
    if application is None:
        return None
    if application.status == DriverApplicationStatus.APPROVED:
        if await _active_driver_for_user(db_session, user_id=user_id, application=application) is None:
            return None
    return application


async def submit_application(
    db_session: AsyncSession,
    *,
    user: User,
    language: str,
    answers: dict[str, str],
    files: dict[str, dict[str, Any]],
) -> DriverApplication:
    existing = await get_user_application(db_session, user_id=user.user_id)
    if existing is not None:
        if existing.status == DriverApplicationStatus.PENDING:
            raise HTTPException(status_code=409, detail="Application is already pending review.")
        if existing.status == DriverApplicationStatus.APPROVED:
            if await _active_driver_for_user(db_session, user_id=user.user_id, application=existing) is not None:
                raise HTTPException(status_code=409, detail="Application is already approved.")

    schema = await get_form_schema(db_session)
    normalized_answers, normalized_files = _validate_submission(
        schema=schema,
        answers=answers,
        files=files,
    )

    lang = language if language in SUPPORTED_USER_LANGUAGES else DEFAULT_USER_LANGUAGE

    application = DriverApplication(
        id=str(uuid4()),
        user_id=user.user_id,
        status=DriverApplicationStatus.PENDING,
        language=lang,
        answers_json=normalized_answers,
        files_json=normalized_files,
        rejection_reason=None,
        reviewed_by=None,
        reviewed_at=None,
        created_driver_id=None,
    )
    db_session.add(application)
    await db_session.commit()
    await db_session.refresh(application)
    return application


async def list_applications(
    db_session: AsyncSession,
    *,
    status: str | None = None,
    limit: int,
    offset: int,
) -> tuple[list[DriverApplication], int]:
    stmt = select(DriverApplication).order_by(DriverApplication.created_at.desc())
    count_stmt = select(func.count()).select_from(DriverApplication)
    if status:
        stmt = stmt.where(DriverApplication.status == status)
        count_stmt = count_stmt.where(DriverApplication.status == status)

    total_result = await db_session.execute(count_stmt)
    total = int(total_result.scalar_one() or 0)
    result = await db_session.execute(stmt.limit(limit).offset(offset))
    return list(result.scalars().all()), total


async def get_application(db_session: AsyncSession, *, application_id: str) -> DriverApplication | None:
    return await db_session.get(DriverApplication, application_id)


async def count_pending_applications(db_session: AsyncSession) -> int:
    result = await db_session.execute(
        select(func.count())
        .select_from(DriverApplication)
        .where(DriverApplication.status == DriverApplicationStatus.PENDING)
    )
    return int(result.scalar_one() or 0)


def _extract_driver_payload(
    *,
    schema: dict[str, Any],
    application: DriverApplication,
    user: User,
) -> dict[str, Any]:
    fields_by_id = {field["id"]: field for field in schema.get("fields", [])}
    payload: dict[str, Any] = {
        "name": (user.username or user.user_id).strip(),
        "photo_url": None,
        "car_brand": "Unknown",
        "car_model": "Unknown",
        "car_plate": "Unknown",
        "vehicle_color": "Unknown",
        "seats_count": 4,
        "license_number": "",
        "about": "",
    }

    for field_id, field in fields_by_id.items():
        binding = field.get("driverField")
        if not binding:
            continue
        if field["type"] == "file":
            file_entry = (application.files_json or {}).get(field_id)
            if file_entry and binding == "photo":
                payload["photo_url"] = str(file_entry.get("objectKey") or "").strip() or None
            continue

        value = str((application.answers_json or {}).get(field_id) or "").strip()
        if not value:
            continue

        if binding == "name":
            payload["name"] = value
        elif binding == "carBrand":
            payload["car_brand"] = value
        elif binding == "carModel":
            payload["car_model"] = value
        elif binding == "carPlate":
            payload["car_plate"] = value
        elif binding == "vehicleColor":
            payload["vehicle_color"] = value
        elif binding == "seatsCount":
            try:
                payload["seats_count"] = max(1, min(12, int(value)))
            except ValueError:
                payload["seats_count"] = 4
        elif binding == "licenseNumber":
            payload["license_number"] = value
        elif binding == "about":
            payload["about"] = value

    if not payload["name"]:
        payload["name"] = user.user_id
    return payload


async def approve_application(
    db_session: AsyncSession,
    *,
    application_id: str,
    reviewed_by: str,
) -> tuple[DriverApplication, str]:
    application = await get_application(db_session, application_id=application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    if application.status != DriverApplicationStatus.PENDING:
        raise HTTPException(status_code=409, detail="Application is not pending.")

    user = await db_session.get(User, application.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Applicant user not found.")

    schema = await get_form_schema(db_session)
    driver_payload = _extract_driver_payload(schema=schema, application=application, user=user)

    driver = await create_driver(
        db_session,
        user_id=application.user_id,
        name=driver_payload["name"],
        photo_url=driver_payload["photo_url"],
        car_brand=driver_payload["car_brand"],
        car_model=driver_payload["car_model"],
        car_plate=driver_payload["car_plate"],
        vehicle_color=driver_payload["vehicle_color"],
        seats_count=driver_payload["seats_count"],
        license_number=driver_payload["license_number"],
        about=driver_payload["about"],
        can_sell_points=False,
        can_self_assign=False,
    )
    raw_key = getattr(driver, "_raw_key", "")

    application.status = DriverApplicationStatus.APPROVED
    application.reviewed_by = reviewed_by
    application.reviewed_at = datetime.now(timezone.utc)
    application.created_driver_id = driver.id
    application.rejection_reason = None
    await db_session.commit()
    await db_session.refresh(application)
    return application, raw_key


async def reject_application(
    db_session: AsyncSession,
    *,
    application_id: str,
    reviewed_by: str,
    rejection_reason: str | None,
) -> DriverApplication:
    application = await get_application(db_session, application_id=application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    if application.status != DriverApplicationStatus.PENDING:
        raise HTTPException(status_code=409, detail="Application is not pending.")

    application.status = DriverApplicationStatus.REJECTED
    application.reviewed_by = reviewed_by
    application.reviewed_at = datetime.now(timezone.utc)
    application.rejection_reason = (rejection_reason or "").strip() or None
    await db_session.commit()
    await db_session.refresh(application)
    return application
