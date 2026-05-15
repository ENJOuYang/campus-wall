from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="allow")

    app_name: str = "DS 校园墙 API"
    database_url: str = "sqlite:///./campus_wall.db"
    admin_token: str = ""
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    upload_dir: str = "./uploads"
    require_approval: bool = False
    gate_question: str = "ds 的中餐多少钱一份？"
    gate_answer: str = "13"
    invite_secret: str = ""


settings = Settings()

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
