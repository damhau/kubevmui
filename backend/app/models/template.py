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
    autoattach_pod_interface: bool = True

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
    autoattach_pod_interface: bool = True

class TemplateList(BaseModel):
    items: list[Template]
    total: int
