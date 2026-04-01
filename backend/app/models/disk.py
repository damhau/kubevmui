from pydantic import BaseModel

from app.models.common import ResourceMeta


class Disk(ResourceMeta):
    size_gb: int
    performance_tier: str
    storage_class: str
    access_mode: str = "ReadWriteOnce"
    volume_mode: str = "Filesystem"
    status: str = "Available"
    attached_vm: str | None = None
    is_image: bool = False
    dv_phase: str | None = None
    dv_progress: str | None = None
    backend_info: str | None = None
    raw_manifest: dict | None = None


class DiskCreate(BaseModel):
    name: str
    namespace: str
    size_gb: int
    performance_tier: str
    labels: dict[str, str] = {}


class DiskResize(BaseModel):
    size_gb: int


class DiskList(BaseModel):
    items: list[Disk]
    total: int
