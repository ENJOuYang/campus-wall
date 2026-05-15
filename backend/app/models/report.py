from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    post_id: int = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: int | None = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reason: str = Column(String(500), nullable=False)
    fingerprint: str = Column(String(64), nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), server_default=func.now())
    resolved: bool = Column(Boolean, default=False)
    resolved_at: datetime | None = Column(DateTime(timezone=True), nullable=True)
    resolved_by: str | None = Column(String(100), nullable=True)
