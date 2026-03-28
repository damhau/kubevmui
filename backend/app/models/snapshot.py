from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class SnapshotPhase(StrEnum):
    pending = "Pending"
    in_progress = "InProgress"
    succeeded = "Succeeded"
    failed = "Failed"
    unknown = "Unknown"


class Snapshot(BaseModel):
    name: str
    namespace: str
    vm_name: str
    phase: SnapshotPhase = SnapshotPhase.unknown
    ready_to_use: bool = False
    creation_time: datetime | None = None
    created_at: datetime | None = None
    error_message: str | None = None


class SnapshotCreate(BaseModel):
    name: str
    vm_name: str


class SnapshotList(BaseModel):
    items: list[Snapshot]
    total: int


class RestoreCreate(BaseModel):
    snapshot_name: str


class Restore(BaseModel):
    name: str
    namespace: str
    vm_name: str
    snapshot_name: str
    complete: bool = False
    restore_time: datetime | None = None
    created_at: datetime | None = None
