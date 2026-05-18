from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_optional_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationRead

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[NotificationRead]:
    if current_user is None:
        return []
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()

    from_user_ids = sorted({n.from_user_id for n in rows if n.from_user_id is not None})
    from_users = {}
    if from_user_ids:
        users = db.scalars(select(User).where(User.id.in_(from_user_ids))).all()
        from_users = {user.id: user for user in users}

    result = []
    for n in rows:
        from_user = from_users.get(n.from_user_id) if n.from_user_id else None
        result.append(
            NotificationRead(
                id=n.id,
                type=n.type,
                post_id=n.post_id,
                from_username=from_user.username if from_user else None,
                from_nickname=from_user.nickname if from_user else None,
                is_read=n.is_read,
                created_at=n.created_at,
            )
        )
    return result


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    if current_user is None:
        return {"count": 0}
    count = db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    ) or 0
    return {"count": int(count)}


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    if current_user is None:
        raise HTTPException(401)
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != current_user.id:
        raise HTTPException(404)
    n.is_read = True
    db.commit()
    return {"message": "已读"}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    if current_user is None:
        raise HTTPException(401)
    db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    db.commit()
    return {"message": "全部已读"}
