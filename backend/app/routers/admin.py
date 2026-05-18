from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import limiter
from app.database import get_db
from app.dependencies.auth import extract_bearer_token, get_admin_role, require_admin, require_super_admin
from app.modules.post_reads import build_post_reads
from app.models.post import Post
from app.models.report import Report
from app.models.user import User
from app.schemas.admin import (
    AdminBanUser,
    AdminPostAction,
    AdminResolveReport,
    AdminUserAction,
    AdminUserRead,
    TicketStatusAction,
)
from app.schemas.post import PostRead
from app.schemas.report import ReportRead

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login")
@limiter.limit("20/minute")
def admin_login(
    request: Request,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> dict:
    token = extract_bearer_token(authorization)
    if token is None:
        raise HTTPException(401, "未提供管理员令牌")
    role = get_admin_role(token, db)
    if role is not None:
        return {"ok": True, "role": role}
    raise HTTPException(403, "管理员令牌无效")


# ── Admin list management (super admin only) ────────────────────────────

@router.get("/admins")
def admin_list_admins(
    db: Session = Depends(get_db),
    _: None = Depends(require_super_admin),
) -> list[dict]:
    rows = db.scalars(select(User).where(User.role == "admin").order_by(User.created_at.desc())).all()
    return [
        {"id": u.id, "username": u.username, "nickname": u.nickname, "role": u.role, "created_at": u.created_at.isoformat()}
        for u in rows
    ]


@router.post("/admins", status_code=201)
def admin_add_admin(
    payload: AdminUserAction,
    db: Session = Depends(get_db),
    _: None = Depends(require_super_admin),
) -> dict:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if not existing:
        raise HTTPException(404, "该用户不存在")
    if existing.role == "admin":
        raise HTTPException(400, "该用户已是管理员")
    existing.role = "admin"
    db.commit()
    return {"message": f"已将 {existing.username} 提升为管理员", "username": existing.username}


@router.delete("/admins/{user_id}")
def admin_remove_admin(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_super_admin),
) -> dict:
    user = db.scalar(select(User).where(User.id == user_id, User.role == "admin"))
    if user is None:
        raise HTTPException(404, "管理员不存在")
    user.role = "user"
    db.commit()
    return {"message": f"已移除管理员 {user.username}", "username": user.username}


# ── Post management ──────────────────────────────────────────────────────

@router.get("/posts", response_model=list[PostRead])
def admin_list_posts(
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> list[PostRead]:
    query = select(Post)
    if status:
        query = query.where(Post.status == status)
    query = query.order_by(Post.created_at.desc()).offset(skip).limit(limit)
    rows = db.scalars(query).all()
    return build_post_reads(db, rows)


@router.patch("/posts/{post_id}")
def admin_act_on_post(
    post_id: int,
    action: AdminPostAction,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> dict:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    if action.action == "delete":
        db.delete(post)
        db.commit()
        return {"message": "帖子已删除"}
    status_map = {"approve": "approved", "reject": "rejected"}
    post.status = status_map[action.action]
    db.commit()
    return {"message": f"帖子已{post.status}", "status": post.status}


@router.patch("/posts/{post_id}/ticket-status")
def admin_set_ticket_status(
    post_id: int,
    payload: TicketStatusAction,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> dict:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    if post.category != "ticket":
        raise HTTPException(400, "仅工单帖子可设置工单状态")
    post.ticket_status = payload.ticket_status
    db.commit()
    return {"message": "工单状态已更新", "ticket_status": payload.ticket_status}


# ── Report management ────────────────────────────────────────────────────

@router.get("/reports", response_model=list[ReportRead])
def admin_list_reports(
    resolved: bool | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> list[ReportRead]:
    query = select(Report)
    if resolved is not None:
        query = query.where(Report.resolved == resolved)
    query = query.order_by(Report.created_at.desc()).offset(skip).limit(limit)
    rows = db.scalars(query).all()
    return [ReportRead.model_validate(r) for r in rows]


@router.patch("/reports/{report_id}")
def admin_resolve_report(
    report_id: int,
    payload: AdminResolveReport,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> dict:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="举报不存在")
    report.resolved = payload.resolved
    if not payload.resolved:
        report.resolved_at = None
        report.resolved_by = None
    else:
        report.resolved_at = datetime.now(timezone.utc)
        report.resolved_by = "admin"
    db.commit()
    return {"message": "举报已处理"}


# ── 用户管理 ──────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserRead])
def admin_list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="搜索用户名或昵称"),
    banned: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> list[AdminUserRead]:
    query = select(User)
    if search:
        pattern = f"%{search}%"
        query = query.where(User.username.ilike(pattern) | User.nickname.ilike(pattern))
    if banned is not None:
        query = query.where(User.is_banned == banned)
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
    rows = db.scalars(query).all()
    return [AdminUserRead.model_validate(r) for r in rows]


@router.patch("/users/{user_id}/ban")
def admin_ban_user(
    user_id: int,
    payload: AdminBanUser,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_banned = payload.banned
    db.commit()
    action = "封禁" if payload.banned else "解封"
    return {"message": f"用户 {user.username} 已{action}", "is_banned": payload.banned}
