from datetime import datetime

from pydantic import BaseModel


class Image(BaseModel):
    name: str
    namespace: str
    display_name: str
    description: str = ""
    os_type: str = ""  # linux, windows
    source_type: str = ""  # container_disk, http, pvc, registry
    source_url: str = ""  # container image URL or HTTP URL
    created_at: datetime | None = None


class ImageCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    os_type: str = "linux"
    source_type: str = "container_disk"
    source_url: str = ""


class ImageList(BaseModel):
    items: list[Image]
    total: int
