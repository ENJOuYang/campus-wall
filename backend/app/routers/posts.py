from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.post import Post
from app.schemas.post import PostCreate, PostList, PostRead

router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=PostList)
def list_posts(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> PostList:
    total = db.scalar(select(func.count()).select_from(Post)) or 0
    rows = db.scalars(select(Post).order_by(Post.created_at.desc()).offset(skip).limit(limit)).all()
    return PostList(items=[PostRead.model_validate(r) for r in rows], total=int(total))


@router.get("/{post_id}", response_model=PostRead)
def get_post(post_id: int, db: Session = Depends(get_db)) -> PostRead:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    return PostRead.model_validate(post)


@router.post("", response_model=PostRead, status_code=201)
def create_post(payload: PostCreate, db: Session = Depends(get_db)) -> PostRead:
    post = Post(title=payload.title, body=payload.body, category=payload.category)
    db.add(post)
    db.commit()
    db.refresh(post)
    return PostRead.model_validate(post)
