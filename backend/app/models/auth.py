from pydantic import BaseModel


class TokenLoginRequest(BaseModel):
    token: str

class TokenLoginResponse(BaseModel):
    username: str
    groups: list[str] = []

class UserInfo(BaseModel):
    username: str
    groups: list[str] = []
    authenticated: bool = False
