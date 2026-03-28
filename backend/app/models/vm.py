from pydantic import BaseModel

from app.models.common import HealthStatus, ResourceMeta, VMStatus


class VMDiskRef(BaseModel):
    name: str
    size_gb: int
    bus: str = "virtio"
    boot_order: int | None = None

class VMNetworkRef(BaseModel):
    name: str
    network_profile: str
    ip_address: str | None = None
    mac_address: str | None = None

class VMCompute(BaseModel):
    cpu_cores: int
    memory_mb: int
    cpu_model: str | None = None
    sockets: int = 1
    cores_per_socket: int | None = None
    threads_per_core: int = 1

class VM(ResourceMeta):
    status: VMStatus = VMStatus.unknown
    health: HealthStatus = HealthStatus.unknown
    compute: VMCompute
    disks: list[VMDiskRef] = []
    networks: list[VMNetworkRef] = []
    node: str | None = None
    ip_addresses: list[str] = []
    os_type: str | None = None
    run_strategy: str = "RerunOnFailure"
    description: str = ""
    template_name: str | None = None

class VMCreate(BaseModel):
    name: str
    namespace: str
    compute: VMCompute
    disks: list[VMDiskRef] = []
    networks: list[VMNetworkRef] = []
    os_type: str | None = None
    run_strategy: str = "RerunOnFailure"
    description: str = ""
    labels: dict[str, str] = {}
    cloud_init_user_data: str | None = None
    cloud_init_network_data: str | None = None
    ssh_key_names: list[str] = []
    template_name: str | None = None

class AddVolumeRequest(BaseModel):
    name: str
    pvc_name: str
    bus: str = "scsi"

class RemoveVolumeRequest(BaseModel):
    name: str

class AddInterfaceRequest(BaseModel):
    name: str
    network_attachment_definition: str

class RemoveInterfaceRequest(BaseModel):
    name: str

class VMCloneRequest(BaseModel):
    new_name: str

class VMPatchRequest(BaseModel):
    run_strategy: str | None = None

class VMList(BaseModel):
    items: list[VM]
    total: int
