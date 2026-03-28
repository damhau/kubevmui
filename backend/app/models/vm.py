from pydantic import BaseModel

from app.models.common import HealthStatus, ResourceMeta, VMStatus


class VMDiskRef(BaseModel):
    name: str
    size_gb: int
    bus: str = "virtio"
    boot_order: int | None = None
    source_type: str = "pvc"  # "pvc" or "container_disk"
    image: str = ""  # container disk image URL (only for source_type="container_disk")

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

class VMEvent(BaseModel):
    timestamp: str = ""
    type: str = ""  # Normal, Warning
    reason: str = ""
    message: str = ""

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
    events: list[VMEvent] = []

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
    firmware_boot_mode: str | None = None  # "bios", "uefi", or None (default)
    secure_boot: bool = False
    node_selector: dict[str, str] = {}
    tolerations: list[dict] = []
    eviction_strategy: str | None = None  # "LiveMigrate" or None

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
