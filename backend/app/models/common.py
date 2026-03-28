from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class HealthStatus(StrEnum):
    healthy = "healthy"
    degraded = "degraded"
    critical = "critical"
    unknown = "unknown"

class VMStatus(StrEnum):
    running = "running"
    stopped = "stopped"
    starting = "starting"
    stopping = "stopping"
    migrating = "migrating"
    paused = "paused"
    error = "error"
    provisioning = "provisioning"
    unknown = "unknown"

class DiskBus(StrEnum):
    virtio = "virtio"
    sata = "sata"
    scsi = "scsi"

class NetworkType(StrEnum):
    bridge = "bridge"
    masquerade = "masquerade"
    sriov = "sr-iov"

class ResourceMeta(BaseModel):
    name: str
    namespace: str
    created_at: datetime | None = None
    labels: dict[str, str] = {}
    annotations: dict[str, str] = {}
