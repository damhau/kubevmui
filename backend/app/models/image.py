from datetime import datetime

from pydantic import BaseModel


class Image(BaseModel):
    name: str
    display_name: str
    description: str = ""
    os_type: str = ""  # linux, windows
    media_type: str = "disk"  # disk, iso
    source_type: str = ""  # container_disk, http, pvc, registry, upload
    source_url: str = ""  # container image URL or HTTP URL
    size_gb: int = 20
    storage_class: str = ""
    storage_namespace: str = "default"  # namespace where the backing DV/PVC lives
    dv_phase: str = ""  # Pending, ImportScheduled, ImportInProgress, Succeeded, Failed
    dv_progress: str = ""  # e.g. "45.5%"
    created_at: datetime | None = None
    raw_manifest: dict | None = None
    raw_dv_manifest: dict | None = None


class ImageCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    os_type: str = "linux"
    media_type: str = "disk"
    source_type: str = "container_disk"
    source_url: str = ""
    size_gb: int = 20
    storage_class: str = ""
    storage_namespace: str = "default"
    source_pvc_name: str = ""  # For pvc_clone: name of the source PVC to clone
    source_pvc_namespace: str = ""  # For pvc_clone: namespace of the source PVC


class ImageList(BaseModel):
    items: list[Image]
    total: int
