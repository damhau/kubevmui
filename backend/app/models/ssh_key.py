from datetime import datetime

from pydantic import BaseModel


class SSHKey(BaseModel):
    name: str
    namespace: str
    public_key: str
    created_at: datetime | None = None


class SSHKeyCreate(BaseModel):
    name: str
    public_key: str


class SSHKeyList(BaseModel):
    items: list[SSHKey]
    total: int
