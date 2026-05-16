from datetime import datetime

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: int
    type: str
    post_id: int
    from_username: str | None = None
    from_nickname: str | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
