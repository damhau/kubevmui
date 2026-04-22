from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class SourceType(StrEnum):
    HYPERV = "hyperv"
    VCENTER = "vcenter"
    ESXI = "esxi"
    OVA = "ova"


class PlanPhase(StrEnum):
    PENDING = "Pending"
    VALIDATING = "Validating"
    IN_PROGRESS = "InProgress"
    COMPLETED = "Completed"
    FAILED = "Failed"
    PARTIALLY_COMPLETED = "PartiallyCompleted"


class VMPhase(StrEnum):
    PENDING = "Pending"
    EXPORTING_DISK = "ExportingDisk"
    CONVERTING_DISK = "ConvertingDisk"
    IMPORTING_DISK = "ImportingDisk"
    CREATING_VM = "CreatingVM"
    COMPLETED = "Completed"
    FAILED = "Failed"


class SourceConfig(BaseModel):
    type: SourceType
    endpoint: str = ""
    credentials_ref: str = ""
    ova_upload_id: str = ""
    insecure_skip_verify: bool = False
    winrm_port: int | None = None
    winrm_transport: str = ""


class NetworkMapping(BaseModel):
    source: str
    target: str


class StorageMapping(BaseModel):
    source: str
    target: str


class VMImport(BaseModel):
    source_vm_id: str
    source_name: str
    target_name: str = ""
    cpu_cores: int | None = None
    memory_mb: int | None = None
    firmware: str = ""  # bios | uefi
    start_after_migration: bool = False
    install_guest_agent: bool = True
    capture_as_image: bool = False


class DiskImportStatus(BaseModel):
    name: str = ""
    size_mb: int = 0
    phase: str = ""
    progress: int = 0


class VMImportStatus(BaseModel):
    name: str
    phase: VMPhase = VMPhase.PENDING
    progress: int = 0
    error: str = ""
    start_time: datetime | None = None
    completion_time: datetime | None = None
    disk_statuses: list[DiskImportStatus] = Field(default_factory=list)


class MigrationPlanStatus(BaseModel):
    phase: PlanPhase = PlanPhase.PENDING
    start_time: datetime | None = None
    completion_time: datetime | None = None
    message: str = ""
    vm_statuses: list[VMImportStatus] = Field(default_factory=list)


class MigrationPlan(BaseModel):
    name: str
    display_name: str
    description: str = ""
    source: SourceConfig
    target_namespace: str
    network_mappings: list[NetworkMapping] = Field(default_factory=list)
    storage_mappings: list[StorageMapping] = Field(default_factory=list)
    vms: list[VMImport] = Field(default_factory=list)
    status: MigrationPlanStatus = Field(default_factory=MigrationPlanStatus)
    created_at: datetime | None = None
    raw_manifest: dict | None = None


class MigrationPlanCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    source: SourceConfig
    target_namespace: str
    network_mappings: list[NetworkMapping] = Field(default_factory=list)
    storage_mappings: list[StorageMapping] = Field(default_factory=list)
    vms: list[VMImport] = Field(default_factory=list)


class MigrationPlanList(BaseModel):
    items: list[MigrationPlan]
    total: int


class OVAUploadResponse(BaseModel):
    upload_id: str
    size_mb: int
    vm_name: str = ""
    disk_count: int = 0


class ValidationResult(BaseModel):
    ok: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
