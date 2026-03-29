from pydantic import BaseModel

from app.models.common import HealthStatus, ResourceMeta, VMStatus


class VMDiskRef(BaseModel):
    name: str
    size_gb: int
    bus: str = "virtio"
    boot_order: int | None = None
    source_type: str = "pvc"  # "pvc", "container_disk", or "datavolume_clone"
    image: str = ""  # container disk image URL (only for source_type="container_disk")
    clone_source: str = ""  # name of the source DataVolume/PVC to clone from
    clone_namespace: str = ""  # namespace of the source (defaults to VM namespace)
    storage_class: str = ""  # storage class for the cloned DV
    volume_name: str = ""  # actual PVC/DataVolume name backing this disk
    used_gb: float = 0  # used storage from guest agent


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


class GuestAgentInfo(BaseModel):
    hostname: str = ""
    os_name: str = ""
    os_version: str = ""
    os_id: str = ""
    kernel: str = ""
    timezone: str = ""


class VMEvent(BaseModel):
    timestamp: str = ""
    type: str = ""  # Normal, Warning
    reason: str = ""
    message: str = ""
    source: str = ""  # VirtualMachine, VirtualMachineInstance, DataVolume
    object_name: str = ""


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
    guest_agent_info: GuestAgentInfo | None = None
    raw_manifest: dict | None = None
    raw_vmi_manifest: dict | None = None


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
    autoattach_pod_interface: bool = True


class AddDiskToSpecRequest(BaseModel):
    name: str
    bus: str = "virtio"
    size_gb: int | None = None
    storage_class: str | None = None
    pvc_name: str | None = None
    source_type: str = "blank"  # "blank", "existing", "clone"
    image_name: str | None = None
    image_namespace: str | None = None


class AddVolumeRequest(BaseModel):
    name: str
    pvc_name: str
    bus: str = "scsi"


class RemoveVolumeRequest(BaseModel):
    name: str


class AddInterfaceRequest(BaseModel):
    name: str
    network_attachment_definition: str


class AddInterfaceToSpecRequest(BaseModel):
    name: str
    type: str = "pod"  # "pod" or "multus"
    nad_name: str | None = None
    model: str | None = None
    mac_address: str | None = None


class RemoveInterfaceRequest(BaseModel):
    name: str


class VMCloneRequest(BaseModel):
    new_name: str


class VMPatchRequest(BaseModel):
    run_strategy: str | None = None
    cpu_cores: int | None = None
    memory_mb: int | None = None


class VMList(BaseModel):
    items: list[VM]
    total: int
