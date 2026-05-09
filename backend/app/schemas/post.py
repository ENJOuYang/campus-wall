from datetime import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)
    category: str = Field(default="general", max_length=50)


class PostRead(BaseModel):
    id: int
    title: str
    body: str
    category: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PostList(BaseModel):
    items: list[PostRead]
    total: int
