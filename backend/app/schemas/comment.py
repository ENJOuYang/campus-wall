from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_serializer

from app.schemas.post import AuthorInfo


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    fingerprint: str = Field(..., min_length=1)


class CommentRead(BaseModel):
    id: int
    post_id: int
    body: str
    fingerprint: str
    created_at: datetime
    author: AuthorInfo | None = None

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
