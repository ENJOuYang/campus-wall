from datetime import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)
    category: str = Field(default="general", max_length=50)
    image_urls: list[str] = Field(default_factory=list)


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

    model_config = {"from_attributes": True}


class PostList(BaseModel):
    items: list[PostRead]
    total: int
