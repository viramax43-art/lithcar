from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, UniqueConstraint, func

from app.models import Base


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (
        UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_blocks_pair"),
        CheckConstraint("blocker_user_id != blocked_user_id", name="ck_user_blocks_no_self"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    blocker_user_id = Column(
        String,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    blocked_user_id = Column(
        String,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
