from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from app.database import Base


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("post_id", "fingerprint", name="uq_post_fingerprint"),)

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    post_id: int = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: int | None = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    fingerprint: str = Column(String(64), nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), server_default=func.now())
