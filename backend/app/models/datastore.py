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
