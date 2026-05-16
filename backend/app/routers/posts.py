import json
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import decode_access_token
from app.config import settings
from app.database import get_db
from app.config import limiter
from app.models.comment import Comment
from app.models.like import Like
from app.models.post import Post
from app.models.notification import Notification
from app.models.report import Report
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentRead
from app.schemas.like import LikeCreate, LikeToggleResponse
from app.schemas.post import AuthorInfo, PostCreate, PostList, PostRead
from app.schemas.report import ReportCreate

router = APIRouter(prefix="/posts", tags=["posts"])


def _get_author(post: Post, db: Session) -> AuthorInfo | None:
    if post.user_id:
        user = db.get(User, post.user_id)
        if user:
            return AuthorInfo(username=user.username, nickname=user.nickname)
    return None


def _get_optional_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User | None:
    if not authorization:
        return None
    token = authorization.removeprefix("Bearer ").strip()
    user_id = decode_access_token(token)
    if user_id is None:
        return None
    return db.get(User, user_id)


def _is_admin(authorization: str | None, db: Session) -> bool:
    if not authorization:
        return False
    token = authorization.removeprefix("Bearer ").strip()
    if settings.admin_token and token == settings.admin_token:
        return True
    return bool(db.scalar(select(User).where(User.fingerprint == token, User.role == "admin")))


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
    created_at = post.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    return PostRead(
        id=post.id,
        title=post.title,
        body=post.body,
        category=post.category,
        created_at=created_at,
        image_urls=_parse_image_urls(post),
        view_count=post.view_count or 0,
        like_count=like_count,
        is_liked=is_liked,
        status=post.status,
        ticket_status=post.ticket_status,
        author=_get_author(post, db),
    )


@router.get("", response_model=PostList)
def list_posts(
    request: Request,
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
    request: Request,
    post_id: int,
    db: Session = Depends(get_db),
    fingerprint: str | None = Query(None),
) -> PostRead:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    return _post_to_read(post, db, fingerprint)


@router.post("", response_model=PostRead, status_code=201)
@limiter.limit("5/minute")
def create_post(
    request: Request,
    payload: PostCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(_get_optional_user),
    authorization: str | None = Header(None),
) -> PostRead:
    if current_user is None and not _is_admin(authorization, db):
        raise HTTPException(401, "请先登录后再发帖")

    if current_user and current_user.is_banned:
        raise HTTPException(403, "您的账号已被封禁，无法发帖")

    if payload.category == "notice" and not _is_admin(authorization, db):
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
        user_id=None if payload.anonymous else (current_user.id if current_user else None),
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_read(post, db)


@router.post("/{post_id}/view")
@limiter.limit("60/minute")
def increment_view(request: Request, post_id: int, db: Session = Depends(get_db)) -> dict:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    post.view_count = (post.view_count or 0) + 1
    db.commit()
    return {"view_count": post.view_count}


@router.post("/{post_id}/like", response_model=LikeToggleResponse)
@limiter.limit("30/minute")
def toggle_like(
    request: Request,
    post_id: int,
    payload: LikeCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(_get_optional_user),
) -> LikeToggleResponse:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")

    # Check by fingerprint first, then by user_id
    existing = db.scalar(
        select(Like).where(Like.post_id == post_id, Like.fingerprint == payload.fingerprint)
    )
    if current_user and not existing:
        existing = db.scalar(
            select(Like).where(Like.post_id == post_id, Like.user_id == current_user.id)
        )

    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(Like(
            post_id=post_id,
            fingerprint=payload.fingerprint,
            user_id=current_user.id if current_user else None,
        ))
        # Notify post author
        if current_user and post.user_id and post.user_id != current_user.id:
            db.add(Notification(
                user_id=post.user_id,
                type="like",
                post_id=post_id,
                from_user_id=current_user.id,
            ))
        db.commit()
        liked = True
    count = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == post_id)) or 0
    return LikeToggleResponse(liked=liked, like_count=int(count))


@router.get("/{post_id}/comments", response_model=list[CommentRead])
def list_comments(
    request: Request,
    post_id: int,
    db: Session = Depends(get_db),
) -> list[CommentRead]:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    rows = db.scalars(
        select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())
    ).all()
    result = []
    for r in rows:
        comment_dict = CommentRead.model_validate(r).model_dump()
        if r.user_id:
            user = db.get(User, r.user_id)
            if user:
                comment_dict["author"] = {"username": user.username, "nickname": user.nickname}
            else:
                comment_dict["author"] = None
        else:
            comment_dict["author"] = None
        result.append(CommentRead(**comment_dict))
    return result


@router.post("/{post_id}/comments", response_model=CommentRead, status_code=201)
@limiter.limit("10/minute")
def create_comment(
    request: Request,
    post_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(_get_optional_user),
) -> CommentRead:
    if current_user and current_user.is_banned:
        raise HTTPException(403, "您的账号已被封禁，无法评论")
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    comment = Comment(
        post_id=post_id,
        body=payload.body,
        fingerprint=payload.fingerprint,
        user_id=current_user.id if current_user else None,
    )
    db.add(comment)
    # Notify post author
    if current_user and post.user_id and post.user_id != current_user.id:
        db.add(Notification(
            user_id=post.user_id,
            type="comment",
            post_id=post_id,
            from_user_id=current_user.id,
        ))
    db.commit()
    db.refresh(comment)
    result = CommentRead.model_validate(comment)
    if current_user:
        result.author = AuthorInfo(username=current_user.username, nickname=current_user.nickname)
    return result


@router.post("/{post_id}/report", status_code=201)
@limiter.limit("5/minute")
def create_report(
    request: Request,
    post_id: int,
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(_get_optional_user),
) -> dict:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    report = Report(
        post_id=post_id,
        reason=payload.reason,
        fingerprint=payload.fingerprint,
        user_id=current_user.id if current_user else None,
    )
    db.add(report)
    db.commit()
    return {"message": "举报已提交"}
