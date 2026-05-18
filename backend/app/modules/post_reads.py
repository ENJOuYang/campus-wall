import json
from collections.abc import Iterable, Sequence
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.like import Like
from app.models.post import Post
from app.models.user import User
from app.schemas.post import AuthorInfo, PostRead


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def parse_image_urls(image_urls: str | None) -> list[str]:
    try:
        return json.loads(image_urls) if image_urls else []
    except (json.JSONDecodeError, TypeError):
        return []


def load_post_like_counts(db: Session, post_ids: Iterable[int]) -> dict[int, int]:
    ids = sorted(set(post_ids))
    if not ids:
        return {}
    rows = db.execute(
        select(Like.post_id, func.count().label("cnt"))
        .where(Like.post_id.in_(ids), Like.comment_id.is_(None))
        .group_by(Like.post_id)
    ).all()
    return {int(row.post_id): int(row.cnt) for row in rows if row.post_id is not None}


def _load_liked_post_ids(db: Session, post_ids: Iterable[int], fingerprint: str | None) -> set[int]:
    ids = sorted(set(post_ids))
    if not ids or not fingerprint:
        return set()
    rows = db.scalars(
        select(Like.post_id).where(
            Like.post_id.in_(ids),
            Like.comment_id.is_(None),
            Like.fingerprint == fingerprint,
        )
    ).all()
    return {int(post_id) for post_id in rows if post_id is not None}


def _load_authors(db: Session, posts: Sequence[Post]) -> dict[int, AuthorInfo]:
    user_ids = sorted({post.user_id for post in posts if post.user_id is not None})
    if not user_ids:
        return {}
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    return {
        user.id: AuthorInfo(username=user.username, nickname=user.nickname)
        for user in users
    }


def build_post_reads(
    db: Session,
    posts: Sequence[Post],
    fingerprint: str | None = None,
) -> list[PostRead]:
    if not posts:
        return []

    post_ids = [post.id for post in posts]
    authors = _load_authors(db, posts)
    like_counts = load_post_like_counts(db, post_ids)
    liked_post_ids = _load_liked_post_ids(db, post_ids, fingerprint)

    return [
        PostRead(
            id=post.id,
            title=post.title,
            body=post.body,
            category=post.category,
            created_at=ensure_utc(post.created_at),
            image_urls=parse_image_urls(post.image_urls),
            view_count=post.view_count or 0,
            like_count=like_counts.get(post.id, 0),
            is_liked=post.id in liked_post_ids,
            status=post.status,
            ticket_status=post.ticket_status,
            author=authors.get(post.user_id) if post.user_id is not None else None,
        )
        for post in posts
    ]


def build_post_read(
    db: Session,
    post: Post,
    fingerprint: str | None = None,
) -> PostRead:
    return build_post_reads(db, [post], fingerprint)[0]
