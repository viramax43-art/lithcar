from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.api.auth import get_current_user
from app.core.dependencies import get_db_session
from app.core.i18n_text import normalize_user_info_text_i18n
from app.models.admin_api_key import AdminApiRole
from app.models.user import User
from app.api.driver_portal import DriverSessionOut, _to_driver_session_out
from app.services.driver_notification_service import (
    notify_driver_application_approved,
    notify_driver_application_rejected,
    notify_driver_application_submitted,
)
from app.services.notification_service import notify_admins_new_driver_application
from app.services.driver_service import get_driver_by_user_id, touch_driver_online
from app.services.driver_session_service import apply_driver_session_cookie
from app.services.telegram_app_links import build_driver_cabinet_enter_url, build_permanent_driver_cabinet_enter_url
from app.services.driver_registration_service import (
    MAX_FILE_SIZE_BYTES,
    approve_application,
    count_pending_applications,
    get_application,
    get_form_schema,
    get_or_create_registration_settings,
    get_user_application_for_portal,
    list_applications,
    normalize_form_schema,
    reject_application,
    submit_application,
    update_form_schema,
)
from app.services.storage_service import (
    download_driver_application_file,
    upload_driver_application_file,
)


router = APIRouter(prefix="/driver-registration")


class I18nTextOut(BaseModel):
    lt: str = ""
    pl: str = ""
    en: str = ""
    ru: str = ""


class FormFieldOut(BaseModel):
    id: str
    type: str
    required: bool
    order: int
    label: I18nTextOut
    placeholder: I18nTextOut
    helpText: I18nTextOut
    driverField: str | None = None
    accept: str | None = None


class FormSchemaOut(BaseModel):
    introText: I18nTextOut
    fields: list[FormFieldOut]


class FileEntryIn(BaseModel):
    objectKey: str
    fileName: str = "file"
    contentType: str = "application/octet-stream"
    sizeBytes: int = Field(ge=0)


class ApplicationSubmitIn(BaseModel):
    language: str = "lt"
    answers: dict[str, str] = Field(default_factory=dict)
    files: dict[str, FileEntryIn] = Field(default_factory=dict)


class FileEntryOut(BaseModel):
    objectKey: str
    fileName: str
    contentType: str
    sizeBytes: int
    fileUrl: str


class ApplicationOut(BaseModel):
    id: str
    userId: str
    username: str | None = None
    status: str
    language: str
    answers: dict[str, str]
    files: dict[str, FileEntryOut]
    rejectionReason: str | None = None
    reviewedBy: str | None = None
    reviewedAt: datetime | None = None
    createdDriverId: str | None = None
    createdAt: datetime
    updatedAt: datetime


class ApplicationPage(BaseModel):
    items: list[ApplicationOut]
    total: int
    limit: int
    offset: int
    pendingCount: int


class ApplicationApproveResult(BaseModel):
    application: ApplicationOut
    key: str


class ApplicationRejectIn(BaseModel):
    rejectionReason: str | None = None


class FileUploadOut(BaseModel):
    objectKey: str
    fileName: str
    contentType: str
    sizeBytes: int
    fileUrl: str


class FormSchemaUpdateIn(BaseModel):
    introText: I18nTextOut | dict[str, str] | None = None
    fields: list[dict[str, Any]] = Field(default_factory=list)


def _i18n_out(raw: dict[str, str] | None) -> I18nTextOut:
    normalized = normalize_user_info_text_i18n(raw)
    return I18nTextOut(**normalized)


def _form_schema_out(schema: dict[str, Any]) -> FormSchemaOut:
    fields = []
    for field in schema.get("fields", []):
        fields.append(
            FormFieldOut(
                id=field["id"],
                type=field["type"],
                required=bool(field.get("required")),
                order=int(field.get("order", 0)),
                label=_i18n_out(field.get("label")),
                placeholder=_i18n_out(field.get("placeholder")),
                helpText=_i18n_out(field.get("helpText")),
                driverField=field.get("driverField"),
                accept=field.get("accept"),
            )
        )
    return FormSchemaOut(introText=_i18n_out(schema.get("introText")), fields=fields)


def _file_entry_out(field_id: str, entry: dict[str, Any]) -> FileEntryOut:
    object_key = str(entry.get("objectKey") or "")
    return FileEntryOut(
        objectKey=object_key,
        fileName=str(entry.get("fileName") or "file"),
        contentType=str(entry.get("contentType") or "application/octet-stream"),
        sizeBytes=int(entry.get("sizeBytes") or 0),
        fileUrl=f"/api/driver-registration/files/{quote(object_key, safe='/')}",
    )


async def _application_out(db_session: AsyncSession, application) -> ApplicationOut:
    user = await db_session.get(User, application.user_id)
    files_out: dict[str, FileEntryOut] = {}
    for field_id, entry in (application.files_json or {}).items():
        if isinstance(entry, dict):
            files_out[field_id] = _file_entry_out(field_id, entry)
    return ApplicationOut(
        id=application.id,
        userId=application.user_id,
        username=user.username if user else None,
        status=application.status,
        language=application.language,
        answers={key: str(value) for key, value in (application.answers_json or {}).items()},
        files=files_out,
        rejectionReason=application.rejection_reason,
        reviewedBy=application.reviewed_by,
        reviewedAt=application.reviewed_at,
        createdDriverId=application.created_driver_id,
        createdAt=application.created_at,
        updatedAt=application.updated_at,
    )


@router.get("/form", response_model=FormSchemaOut)
async def get_public_form_schema(db_session: AsyncSession = Depends(get_db_session)):
    schema = await get_form_schema(db_session)
    return _form_schema_out(schema)


@router.post("/files", response_model=FileUploadOut)
async def upload_application_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size must be <= 5MB.")
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    content_type = file.content_type or "application/octet-stream"
    key = upload_driver_application_file(
        filename=file.filename or "attachment",
        content_type=content_type,
        content=content,
    )
    return FileUploadOut(
        objectKey=key,
        fileName=file.filename or "attachment",
        contentType=content_type,
        sizeBytes=len(content),
        fileUrl=f"/api/driver-registration/files/{quote(key, safe='/')}",
    )


@router.get("/files/{object_key:path}")
async def get_application_file(object_key: str):
    if not object_key.startswith("driver-applications/"):
        raise HTTPException(status_code=404, detail="File not found.")
    try:
        body, content_type = download_driver_application_file(object_key=object_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="File not found.") from exc
    return Response(content=body, media_type=content_type)


@router.post("/applications", response_model=ApplicationOut)
async def submit_driver_application(
    payload: ApplicationSubmitIn,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    files_payload = {
        field_id: entry.model_dump()
        for field_id, entry in payload.files.items()
    }
    application = await submit_application(
        db_session,
        user=current_user,
        language=payload.language,
        answers=payload.answers,
        files=files_payload,
    )
    await notify_driver_application_submitted(
        user_id=current_user.user_id,
        language=application.language,
    )
    applicant_name = (
        str(payload.answers.get("full_name") or "").strip()
        or (current_user.username or "").strip()
        or current_user.user_id
    )
    await notify_admins_new_driver_application(
        db_session,
        application_id=application.id,
        applicant_name=applicant_name,
    )
    return await _application_out(db_session, application)


@router.get("/applications/me", response_model=ApplicationOut | None)
async def get_my_driver_application(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    application = await get_user_application_for_portal(db_session, user_id=current_user.user_id)
    if application is None:
        return None
    return await _application_out(db_session, application)


class DriverEnterUrlOut(BaseModel):
    enterUrl: str


@router.get("/driver-access/enter-url", response_model=DriverEnterUrlOut)
async def get_driver_enter_url(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await get_driver_by_user_id(db_session, user_id=current_user.user_id)
    if driver is None:
        raise HTTPException(status_code=403, detail="Driver profile not found.")
    return DriverEnterUrlOut(
        enterUrl=build_permanent_driver_cabinet_enter_url(driver_id=driver.id),
    )


@router.post("/driver-access/bootstrap", response_model=DriverSessionOut)
async def bootstrap_driver_access(
    response: Response,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    driver = await get_driver_by_user_id(db_session, user_id=current_user.user_id)
    if driver is None:
        raise HTTPException(status_code=403, detail="Driver profile not found.")
    driver = await touch_driver_online(db_session, driver_id=driver.id)
    if driver is None:
        raise HTTPException(status_code=403, detail="Driver profile not found.")
    apply_driver_session_cookie(response, driver_id=driver.id)
    return await _to_driver_session_out(
        db_session,
        driver_id=driver.id,
        name=driver.name,
        can_sell_points=driver.can_sell_points,
        can_self_assign=driver.can_self_assign,
    )


@router.get("/applications", response_model=ApplicationPage)
async def list_driver_applications(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    applications, total = await list_applications(
        db_session,
        status=status,
        limit=limit,
        offset=offset,
    )
    pending_count = await count_pending_applications(db_session)
    items = [await _application_out(db_session, item) for item in applications]
    return ApplicationPage(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        pendingCount=pending_count,
    )


@router.get("/applications/{application_id}", response_model=ApplicationOut)
async def get_driver_application(
    application_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    application = await get_application(db_session, application_id=application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    return await _application_out(db_session, application)


@router.post("/applications/{application_id}/approve", response_model=ApplicationApproveResult)
async def approve_driver_application(
    application_id: str,
    session=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    application, raw_key, login_token = await approve_application(
        db_session,
        application_id=application_id,
        reviewed_by=session.admin_key_id,
    )
    await notify_driver_application_approved(
        user_id=application.user_id,
        language=application.language,
        enter_url=build_driver_cabinet_enter_url(login_token),
    )
    return ApplicationApproveResult(
        application=await _application_out(db_session, application),
        key=raw_key,
    )


@router.post("/applications/{application_id}/resend-enter-link", response_model=DriverEnterUrlOut)
async def resend_driver_cabinet_enter_link(
    application_id: str,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    application = await get_application(db_session, application_id=application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    if application.status != "approved" or not application.created_driver_id:
        raise HTTPException(status_code=409, detail="Application is not approved.")
    enter_url = build_permanent_driver_cabinet_enter_url(driver_id=application.created_driver_id)
    await notify_driver_application_approved(
        user_id=application.user_id,
        language=application.language,
        enter_url=enter_url,
    )
    return DriverEnterUrlOut(enterUrl=enter_url)


@router.post("/applications/{application_id}/reject", response_model=ApplicationOut)
async def reject_driver_application(
    application_id: str,
    payload: ApplicationRejectIn,
    session=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    application = await reject_application(
        db_session,
        application_id=application_id,
        reviewed_by=session.admin_key_id,
        rejection_reason=payload.rejectionReason,
    )
    await notify_driver_application_rejected(
        user_id=application.user_id,
        language=application.language,
        reason=application.rejection_reason,
    )
    return await _application_out(db_session, application)


@router.get("/settings", response_model=FormSchemaOut)
async def get_registration_settings(
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    schema = await get_form_schema(db_session)
    return _form_schema_out(schema)


@router.put("/settings", response_model=FormSchemaOut)
async def update_registration_settings(
    payload: FormSchemaUpdateIn,
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN)),
    db_session: AsyncSession = Depends(get_db_session),
):
    current = await get_or_create_registration_settings(db_session)
    current_schema = normalize_form_schema(current.form_schema_json)
    next_schema = {
        "introText": payload.introText.model_dump() if isinstance(payload.introText, I18nTextOut) else payload.introText or current_schema.get("introText"),
        "fields": payload.fields if payload.fields else current_schema.get("fields", []),
    }
    try:
        updated = await update_form_schema(db_session, schema=next_schema)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _form_schema_out(updated)
