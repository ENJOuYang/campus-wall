from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import decode_access_token
from app.config import settings
from app.database import get_db
from app.models.user import User


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    token = authorization.removeprefix("Bearer ").strip()
    return token or None


def get_user_from_token(token: str | None, db: Session) -> User | None:
    if token is None:
        return None
    user_id = decode_access_token(token)
    if user_id is None:
        return None
    return db.get(User, user_id)


def get_optional_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User | None:
    token = extract_bearer_token(authorization)
    return get_user_from_token(token, db)


def get_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    user = get_optional_user(authorization, db)
    if user is None:
        raise HTTPException(401, "未登录")
    return user


def get_admin_role(token: str | None, db: Session) -> str | None:
    if token is None:
        return None
    if settings.admin_token and token == settings.admin_token:
        return "super_admin"
    if db.scalar(select(User.id).where(User.fingerprint == token, User.role == "admin")) is not None:
        return "admin"
    user = get_user_from_token(token, db)
    if user is not None and user.role == "admin":
        return "admin"
    return None


def is_admin_token(token: str | None, db: Session) -> bool:
    return get_admin_role(token, db) is not None


def require_super_admin(authorization: str | None = Header(None)) -> None:
    if not settings.admin_token:
        raise HTTPException(403, "管理员功能未启用")
    token = extract_bearer_token(authorization)
    if token is None:
        raise HTTPException(401, "未提供管理员令牌")
    if token != settings.admin_token:
        raise HTTPException(403, "需要超级管理员权限")


def require_admin(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> str:
    if not settings.admin_token:
        raise HTTPException(403, "管理员功能未启用")
    token = extract_bearer_token(authorization)
    if token is None:
        raise HTTPException(401, "未提供管理员令牌")
    role = get_admin_role(token, db)
    if role is None:
        raise HTTPException(403, "管理员令牌无效或权限不足")
    return role
