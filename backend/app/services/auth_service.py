from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, decode_token, parse_tg_user_data
from app.models.user import User, UserRole
from app.services.user_service import get_or_create_user


class AuthService:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def login_and_get_token(self, init_data: str) -> str:
        user_dict = parse_tg_user_data(init_data)
        if user_dict is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired initData",
            )

        user_id = user_dict.get("id")
        username = user_dict.get("username")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User data not found in initData",
            )

        user = await get_or_create_user(
            self.db,
            user_id=str(user_id),
            username=username,
        )

        access_token = create_access_token(subject=user.user_id, role=user.role)
        return access_token

    async def get_user_from_token(self, token: str) -> User:
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        try:
            payload = decode_token(token)
            user_id: str = payload.get("sub")
            if user_id is None:
                raise credentials_exception
        except JWTError:
            raise credentials_exception

        user = await self.db.get(User, user_id)
        if user is None:
            raise credentials_exception
        return user

    async def set_user_role(self, user: User, role: str) -> User:
        normalized_role = str(role).strip().lower()
        if normalized_role not in {
            UserRole.PASSENGER,
            UserRole.ADMIN,
            UserRole.DRIVER,
            UserRole.MODERATOR,
        }:
            raise HTTPException(status_code=400, detail="Unsupported role.")
        user.role = normalized_role
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def mark_onboarding_completed(self, user: User) -> None:
        """Помечает onboarding как завершенный."""
        user.onboarding_completed = True
        await self.db.commit()
