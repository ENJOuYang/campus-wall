import json

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.comment import Comment
from app.models.like import Like
from app.models.post import Post
from app.models.report import Report
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentRead
from app.schemas.like import LikeCreate, LikeToggleResponse
from app.schemas.post import PostCreate, PostList, PostRead
from app.schemas.report import ReportCreate

router = APIRouter(prefix="/posts", tags=["posts"])


def _parse_image_urls(post: Post) -> list[str]:
    try:
        return json.loads(post.image_urls) if post.image_urls else []
    except (json.JSONDecodeError, TypeError):
        return []


def _post_to_read(post: Post, db: Session, fingerprint: str | None = None) -> PostRead:
    like_count = db.scalar(
        select(func.count()).select_from(Like).where(Like.post_id == post.id)
    ) or 0
    is_liked = False
    if fingerprint:
        is_liked = db.scalar(
            select(select(Like).where(Like.post_id == post.id, Like.fingerprint == fingerprint).exists())
        ) or False
    return PostRead(
        id=post.id,
        title=post.title,
        body=post.body,
        category=post.category,
        created_at=post.created_at,
        image_urls=_parse_image_urls(post),
        view_count=post.view_count or 0,
        like_count=like_count,
        is_liked=is_liked,
        status=post.status,
        ticket_status=post.ticket_status,
    )


@router.get("", response_model=PostList)
def list_posts(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("latest", pattern="^(latest|hot)$"),
    fingerprint: str | None = Query(None),
) -> PostList:
    base_query = select(Post).where(Post.status == "approved")
    total = db.scalar(select(func.count()).select_from(Post).where(Post.status == "approved")) or 0

    if sort == "hot":
        like_sub = (
            select(Like.post_id, func.count().label("cnt"))
            .group_by(Like.post_id)
            .subquery()
        )
        query = (
            base_query.outerjoin(like_sub, Post.id == like_sub.c.post_id)
            .order_by(like_sub.c.cnt.desc().nullslast(), Post.created_at.desc())
        )
    else:
        query = base_query.order_by(Post.created_at.desc())

    rows = db.scalars(query.offset(skip).limit(limit)).all()
    items = [_post_to_read(r, db, fingerprint) for r in rows]
    return PostList(items=items, total=int(total))


@router.get("/{post_id}", response_model=PostRead)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    fingerprint: str | None = Query(None),
) -> PostRead:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    return _post_to_read(post, db, fingerprint)


@router.post("", response_model=PostRead, status_code=201)
def create_post(
    payload: PostCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
) -> PostRead:
    if payload.category == "notice":
        is_admin = False
        if authorization:
            token = authorization.removeprefix("Bearer ").strip()
            if settings.admin_token and token == settings.admin_token:
                is_admin = True
            elif db.scalar(select(User).where(User.fingerprint == token, User.role == "admin")):
                is_admin = True
        if not is_admin:
            raise HTTPException(403, "仅管理员可发布公告")

    post_status = "pending" if settings.require_approval else "approved"
    image_urls_str = json.dumps(payload.image_urls, ensure_ascii=False) if payload.image_urls else None
    ticket_status = "open" if payload.category == "ticket" else None
    post = Post(
        title=payload.title,
        body=payload.body,
        category=payload.category,
        image_urls=image_urls_str,
        status=post_status,
        ticket_status=ticket_status,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_read(post, db)


@router.post("/{post_id}/view")
def increment_view(post_id: int, db: Session = Depends(get_db)) -> dict:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    post.view_count = (post.view_count or 0) + 1
    db.commit()
    return {"view_count": post.view_count}


@router.post("/{post_id}/like", response_model=LikeToggleResponse)
def toggle_like(post_id: int, payload: LikeCreate, db: Session = Depends(get_db)) -> LikeToggleResponse:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    existing = db.scalar(
        select(Like).where(Like.post_id == post_id, Like.fingerprint == payload.fingerprint)
    )
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(Like(post_id=post_id, fingerprint=payload.fingerprint))
        db.commit()
        liked = True
    count = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == post_id)) or 0
    return LikeToggleResponse(liked=liked, like_count=int(count))


@router.get("/{post_id}/comments", response_model=list[CommentRead])
def list_comments(post_id: int, db: Session = Depends(get_db)) -> list[CommentRead]:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    rows = db.scalars(
        select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())
    ).all()
    return [CommentRead.model_validate(r) for r in rows]


@router.post("/{post_id}/comments", response_model=CommentRead, status_code=201)
def create_comment(post_id: int, payload: CommentCreate, db: Session = Depends(get_db)) -> CommentRead:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    comment = Comment(post_id=post_id, body=payload.body, fingerprint=payload.fingerprint)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentRead.model_validate(comment)


@router.post("/{post_id}/report", status_code=201)
def create_report(post_id: int, payload: ReportCreate, db: Session = Depends(get_db)) -> dict:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    report = Report(post_id=post_id, reason=payload.reason, fingerprint=payload.fingerprint)
    db.add(report)
    db.commit()
    return {"message": "举报已提交"}
