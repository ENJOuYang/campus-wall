from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_serializer


class AuthorInfo(BaseModel):
    username: str
    nickname: str


class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)
    category: str = Field(default="general", max_length=50)
    image_urls: list[str] = Field(default_factory=list)
    anonymous: bool = Field(default=False)


class PostRead(BaseModel):
    id: int
    title: str
    body: str
    category: str
    created_at: datetime
    image_urls: list[str] = Field(default_factory=list)
    view_count: int = 0
    like_count: int = 0
    is_liked: bool = False
    status: str = "approved"
    ticket_status: str | None = None
    author: AuthorInfo | None = None

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class PostList(BaseModel):
    items: list[PostRead]
    total: int
