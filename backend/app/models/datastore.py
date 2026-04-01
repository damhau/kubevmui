from pydantic import BaseModel


class Datastore(BaseModel):
    name: str
    provisioner: str
    is_default: bool = False
    reclaim_policy: str = "Delete"
    volume_binding_mode: str = "WaitForFirstConsumer"
    allow_expansion: bool = False
    parameters: dict[str, str] = {}
    pv_count: int = 0
    total_capacity_gb: int = 0
    available_capacity_gb: int | None = None
    provider_type: str = "unknown"
    provider_details: dict = {}
    raw_manifest: dict | None = None


class DatastoreList(BaseModel):
    items: list[Datastore]
    total: int


class PersistentVolumeInfo(BaseModel):
    name: str
    capacity_gb: int = 0
    phase: str = "Available"
    access_modes: list[str] = []
    reclaim_policy: str = "Delete"
    claim_name: str | None = None
    claim_namespace: str | None = None
    volume_mode: str = "Filesystem"
    raw_manifest: dict | None = None


class PersistentVolumeList(BaseModel):
    items: list[PersistentVolumeInfo]
    total: int
