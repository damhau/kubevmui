from datetime import datetime

from pydantic import BaseModel

from app.models.vm import VMCompute, VMDiskRef, VMNetworkRef


class Template(BaseModel):
    name: str
    created_at: datetime | None = None
    labels: dict[str, str] = {}
    annotations: dict[str, str] = {}
    display_name: str
    description: str = ""
    category: str = "custom"
    os_type: str | None = None
    compute: VMCompute
    disks: list[VMDiskRef] = []
    networks: list[VMNetworkRef] = []
    cloud_init_user_data: str | None = None
    cloud_init_network_data: str | None = None
    status: str = "Ready"  # Ready, Importing, Pending, Failed
    status_message: str = ""
    raw_manifest: dict | None = None


class TemplateCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    category: str = "custom"
    os_type: str | None = None
    compute: VMCompute
    disks: list[VMDiskRef] = []
    networks: list[VMNetworkRef] = []
    cloud_init_user_data: str | None = None
    cloud_init_network_data: str | None = None


class TemplateList(BaseModel):
    items: list[Template]
    total: int
