from datetime import datetime, timezone

from pydantic import BaseModel, field_serializer


class NotificationRead(BaseModel):
    id: int
    type: str
    post_id: int
    from_username: str | None = None
    from_nickname: str | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
