import hashlib
import hmac
import time

from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import create_access_token, decode_access_token, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.config import limiter
from app.models.like import Like
from app.models.post import Post
from app.models.user import User
from app.schemas.auth import GateVerify, TokenResponse, UserLogin, UserRegister, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _invite_code() -> str:
    """当前10分钟窗口的邀请码（8位十六进制）"""
    window = int(time.time()) // 600
    return hmac.new(
        settings.invite_secret.encode(),
        str(window).encode(),
        hashlib.sha256,
    ).hexdigest()[:8]


def _verify_invite(code: str) -> bool:
    """验证邀请码，允许当前窗口和上一个窗口"""
    if not settings.invite_secret:
        return True  # 未配置则跳过验证
    expected = _invite_code()
    prev = hmac.new(
        settings.invite_secret.encode(),
        str(int(time.time()) // 600 - 1).encode(),
        hashlib.sha256,
    ).hexdigest()[:8]
    return code.strip() == expected or code.strip() == prev


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization:
        raise HTTPException(401, "未登录")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(401, "登录已过期，请重新登录")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(401, "用户不存在")
    return user


@router.post("/gate")
def gate_verify(payload: GateVerify) -> dict:
    if payload.answer.strip() == settings.gate_answer:
        return {"ok": True}
    raise HTTPException(403, "答案错误")


@router.get("/invite")
def get_invite_code() -> dict:
    """获取当前邀请码（10分钟有效）"""
    if not settings.invite_secret:
        raise HTTPException(404, "邀请码功能未启用")
    return {"code": _invite_code(), "expires_in": 600 - (int(time.time()) % 600)}


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("3/minute")
def register(request: Request, payload: UserRegister, db: Session = Depends(get_db)) -> TokenResponse:
    # Invite code check
    if settings.invite_secret:
        if not payload.invite_code:
            raise HTTPException(403, "需要邀请码才能注册")
        if not _verify_invite(payload.invite_code):
            raise HTTPException(403, "邀请码无效或已过期（10分钟刷新一次）")

    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(409, "用户名已被注册")

    if payload.phone and db.scalar(select(User).where(User.phone == payload.phone)):
        raise HTTPException(409, "手机号已被注册")

    if payload.email and db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(409, "邮箱已被注册")

    user = User(
        username=payload.username,
        nickname=payload.nickname,
        phone=payload.phone,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(
        select(User).where(
            or_(User.username == payload.account, User.phone == payload.account, User.email == payload.account)
        )
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "账号或密码错误")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


# ── Public user profile ─────────────────────────────────────────────────

@router.get("/users/{username}")
def user_profile(username: str, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(404, "用户不存在")

    posts = db.scalars(
        select(Post).where(Post.user_id == user.id, Post.status == "approved")
        .order_by(Post.created_at.desc())
        .limit(30)
    ).all()

    from app.schemas.post import AuthorInfo

    post_list = []
    for p in posts:
        like_count = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == p.id)) or 0
        created_at = p.created_at
        if created_at and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        post_list.append({
            "id": p.id,
            "title": p.title,
            "category": p.category,
            "created_at": created_at.isoformat(),
            "view_count": p.view_count or 0,
            "like_count": int(like_count),
        })

    created_at = user.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "created_at": created_at.isoformat(),
        "post_count": len(post_list),
        "posts": post_list,
    }
