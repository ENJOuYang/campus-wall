import json

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.config import limiter
from app.database import get_db
from app.dependencies.auth import extract_bearer_token, get_optional_user, is_admin_token
from app.modules.post_reads import build_post_read, build_post_reads
from app.models.comment import Comment
from app.models.like import Like
from app.models.notification import Notification
from app.models.post import Post
from app.models.report import Report
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentRead
from app.schemas.like import LikeCreate, LikeToggleResponse
from app.schemas.post import AuthorInfo, PostCreate, PostList, PostRead
from app.schemas.report import ReportCreate

router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=PostList)
def list_posts(
    request: Request,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("latest", pattern="^(latest|hot)$"),
    fingerprint: str | None = Query(None),
    category: str | None = Query(None),
    search: str | None = Query(None),
) -> PostList:
    filters = [Post.status == "approved"]
    if category:
        filters.append(Post.category == category)
    if search:
        filters.append(
            Post.title.ilike(f"%{search}%") | Post.body.ilike(f"%{search}%")
        )

    base_query = select(Post).where(*filters)
    count_query = select(func.count()).select_from(Post).where(*filters)
    total = db.scalar(count_query) or 0

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
    items = build_post_reads(db, rows, fingerprint)
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
    return build_post_read(db, post, fingerprint)


@router.delete("/{post_id}")
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    if current_user is None:
        raise HTTPException(401, "请先登录")
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    if post.user_id != current_user.id:
        raise HTTPException(403, "仅可删除自己的帖子")
    db.delete(post)
    db.commit()
    return {"message": "帖子已删除"}


@router.post("", response_model=PostRead, status_code=201)
@limiter.limit("10/minute")
def create_post(
    request: Request,
    payload: PostCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    authorization: str | None = Header(None),
) -> PostRead:
    admin_token = extract_bearer_token(authorization)
    if current_user is None and not is_admin_token(admin_token, db):
        raise HTTPException(401, "请先登录后再发帖")

    if current_user and current_user.is_banned:
        raise HTTPException(403, "您的账号已被封禁，无法发帖")

    if payload.category == "notice" and not is_admin_token(admin_token, db):
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
    return build_post_read(db, post)


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
    current_user: User | None = Depends(get_optional_user),
) -> LikeToggleResponse:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")

    # Check by fingerprint first, then by user_id
    existing = db.scalar(
        select(Like).where(Like.post_id == post_id, Like.fingerprint == payload.fingerprint, Like.comment_id.is_(None))
    )
    if current_user and not existing:
        existing = db.scalar(
            select(Like).where(Like.post_id == post_id, Like.user_id == current_user.id, Like.comment_id.is_(None))
        )

    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(Like(
            post_id=post_id,
            comment_id=None,
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
    count = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == post_id, Like.comment_id.is_(None))) or 0
    return LikeToggleResponse(liked=liked, like_count=int(count))


@router.post("/{post_id}/comments/{comment_id}/like", response_model=LikeToggleResponse)
@limiter.limit("30/minute")
def toggle_comment_like(
    request: Request,
    post_id: int,
    comment_id: int,
    payload: LikeCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> LikeToggleResponse:
    comment = db.get(Comment, comment_id)
    if comment is None or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail="评论不存在")

    existing = db.scalar(
        select(Like).where(Like.comment_id == comment_id, Like.fingerprint == payload.fingerprint)
    )
    if current_user and not existing:
        existing = db.scalar(
            select(Like).where(Like.comment_id == comment_id, Like.user_id == current_user.id)
        )

    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(Like(
            comment_id=comment_id,
            post_id=None,
            fingerprint=payload.fingerprint,
            user_id=current_user.id if current_user else None,
        ))
        if current_user and comment.user_id and comment.user_id != current_user.id:
            db.add(Notification(
                user_id=comment.user_id,
                type="comment_like",
                post_id=post_id,
                comment_id=comment_id,
                from_user_id=current_user.id,
            ))
        db.commit()
        liked = True
    count = db.scalar(select(func.count()).select_from(Like).where(Like.comment_id == comment_id)) or 0
    return LikeToggleResponse(liked=liked, like_count=int(count))


@router.get("/{post_id}/comments", response_model=list[CommentRead])
def list_comments(
    request: Request,
    post_id: int,
    db: Session = Depends(get_db),
    fingerprint: str | None = Query(None),
) -> list[CommentRead]:
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")
    rows = db.scalars(
        select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())
    ).all()

    # Prefetch users and like data for all comments
    user_ids = [r.user_id for r in rows if r.user_id]
    users = {}
    if user_ids:
        user_rows = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        users = {u.id: u for u in user_rows}

    comment_ids = [r.id for r in rows]
    like_counts = {}
    user_liked: set[int] = set()
    if comment_ids:
        like_rows = db.execute(
            select(Like.comment_id, func.count().label("cnt"))
            .where(Like.comment_id.in_(comment_ids))
            .group_by(Like.comment_id)
        ).all()
        like_counts = {row.comment_id: row.cnt for row in like_rows}
        if fingerprint:
            liked_rows = db.scalars(
                select(Like.comment_id).where(
                    Like.comment_id.in_(comment_ids),
                    Like.fingerprint == fingerprint,
                )
            ).all()
            user_liked = set(liked_rows)

    # Build dict of CommentRead dicts
    comment_dicts: dict[int, dict] = {}
    for r in rows:
        d = {
            "id": r.id,
            "post_id": r.post_id,
            "body": r.body,
            "fingerprint": r.fingerprint,
            "created_at": r.created_at,
            "author": AuthorInfo(username=users[r.user_id].username, nickname=users[r.user_id].nickname).model_dump() if r.user_id in users else None,
            "parent_id": r.parent_id,
            "replies": [],
            "like_count": int(like_counts.get(r.id, 0)),
            "is_liked": r.id in user_liked,
        }
        comment_dicts[r.id] = d

    # Group replies under parents
    reply_map: dict[int | None, list[dict]] = {}
    for r in rows:
        reply_map.setdefault(r.parent_id, []).append(comment_dicts[r.id])

    def build_tree(d: dict) -> CommentRead:
        d["replies"] = [build_tree(c) for c in reply_map.get(d["id"], [])]
        return CommentRead(**d)

    return [build_tree(c) for c in reply_map.get(None, [])]


@router.post("/{post_id}/comments", response_model=CommentRead, status_code=201)
@limiter.limit("20/minute")
def create_comment(
    request: Request,
    post_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> CommentRead:
    if current_user and current_user.is_banned:
        raise HTTPException(403, "您的账号已被封禁，无法评论")
    post = db.get(Post, post_id)
    if post is None or post.status == "rejected":
        raise HTTPException(status_code=404, detail="帖子不存在")

    # Validate parent comment if replying
    if payload.parent_id is not None:
        parent = db.get(Comment, payload.parent_id)
        if parent is None or parent.post_id != post_id:
            raise HTTPException(status_code=404, detail="父评论不存在或不属于该帖子")

    comment = Comment(
        post_id=post_id,
        body=payload.body,
        fingerprint=payload.fingerprint,
        user_id=current_user.id if current_user else None,
        parent_id=payload.parent_id,
    )
    db.add(comment)
    # Notify post author (for top-level comments only)
    if current_user and post.user_id and post.user_id != current_user.id and payload.parent_id is None:
        db.add(Notification(
            user_id=post.user_id,
            type="comment",
            post_id=post_id,
            from_user_id=current_user.id,
        ))
    # Notify parent comment author (for replies)
    if payload.parent_id is not None and current_user:
        parent_comment = db.get(Comment, payload.parent_id)
        if parent_comment and parent_comment.user_id and parent_comment.user_id != current_user.id:
            db.add(Notification(
                user_id=parent_comment.user_id,
                type="reply",
                post_id=post_id,
                comment_id=parent_comment.id,
                from_user_id=current_user.id,
            ))
    db.commit()
    db.refresh(comment)
    result = CommentRead.model_validate(comment)
    if current_user:
        result.author = AuthorInfo(username=current_user.username, nickname=current_user.nickname)
    return result


@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    if current_user is None:
        raise HTTPException(401, "请先登录")
    comment = db.get(Comment, comment_id)
    if comment is None or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail="评论不存在")
    if comment.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "仅可删除自己的评论")
    # Delete child replies first
    child_replies = db.scalars(select(Comment).where(Comment.parent_id == comment_id)).all()
    for child in child_replies:
        db.delete(child)
    db.delete(comment)
    db.commit()
    return {"message": "评论已删除"}


@router.post("/{post_id}/report", status_code=201)
@limiter.limit("10/minute")
def create_report(
    request: Request,
    post_id: int,
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
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
