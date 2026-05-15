from pydantic import BaseModel, Field


class AdminLogin(BaseModel):
    token: str


class AdminPostAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|delete)$")


class AdminResolveReport(BaseModel):
    resolved: bool = True


class AdminUserAction(BaseModel):
    fingerprint: str = Field(..., min_length=1, max_length=64)


class TicketStatusAction(BaseModel):
    ticket_status: str = Field(..., pattern="^(open|processing|completed|closed)$")
