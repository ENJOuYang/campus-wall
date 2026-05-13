from pydantic import BaseModel, Field


class AdminLogin(BaseModel):
    token: str


class AdminPostAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|delete)$")


class AdminResolveReport(BaseModel):
    resolved: bool = True


class AdminBanUser(BaseModel):
    banned: bool = True


class AdminUserRead(BaseModel):
    id: int
    username: str
    nickname: str
    phone: str | None = None
    email: str | None = None
    is_banned: bool

    model_config = {"from_attributes": True}
