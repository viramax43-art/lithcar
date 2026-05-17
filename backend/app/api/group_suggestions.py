from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_session import require_admin_roles
from app.core.dependencies import get_db_session
from app.models.admin_api_key import AdminApiRole
from app.services.suggestion_service import build_group_suggestions


router = APIRouter(prefix="/group-suggestions")


class GroupSuggestionOut(BaseModel):
    id: str
    requestIds: list[str]
    similarity: int
    reason: str


class GroupSuggestionPage(BaseModel):
    items: list[GroupSuggestionOut]
    total: int
    limit: int
    offset: int


@router.get("", response_model=GroupSuggestionPage)
async def list_group_suggestions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin_roles(AdminApiRole.CHIEF_ADMIN, AdminApiRole.ADMIN, AdminApiRole.MODERATOR)),
    db_session: AsyncSession = Depends(get_db_session),
):
    suggestions = await build_group_suggestions(db_session)
    total = len(suggestions)
    page = suggestions[offset:offset + limit]
    return GroupSuggestionPage(
        items=[GroupSuggestionOut(**item) for item in page],
        total=total,
        limit=limit,
        offset=offset,
    )
