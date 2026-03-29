from pydantic import BaseModel


class AuditEntry(BaseModel):
    timestamp: str
    username: str
    action: str  # create_vm, delete_vm, start_vm, stop_vm, etc.
    resource_type: str  # VirtualMachine, Snapshot, Disk, etc.
    resource_name: str
    namespace: str
    details: str = ""


class AuditLog(BaseModel):
    items: list[AuditEntry]
    total: int
