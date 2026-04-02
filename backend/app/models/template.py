from pydantic import BaseModel

from app.models.common import ResourceMeta
from app.models.vm import VMCompute, VMDiskRef, VMNetworkRef


class Template(ResourceMeta):
    display_name: str
    description: str = ""
    category: str = "custom"
    os_type: str | None = None
    compute: VMCompute
    disks: list[VMDiskRef] = []
    networks: list[VMNetworkRef] = []
    cloud_init_user_data: str | None = None
    cloud_init_network_data: str | None = None
    is_global: bool = False
    status: str = "Ready"  # Ready, Importing, Pending, Failed
    status_message: str = ""
    raw_manifest: dict | None = None


class TemplateCreate(BaseModel):
    name: str
    namespace: str = ""
    display_name: str
    description: str = ""
    category: str = "custom"
    os_type: str | None = None
    compute: VMCompute
    disks: list[VMDiskRef] = []
    networks: list[VMNetworkRef] = []
    cloud_init_user_data: str | None = None
    cloud_init_network_data: str | None = None
    is_global: bool = False


class TemplateList(BaseModel):
    items: list[Template]
    total: int
