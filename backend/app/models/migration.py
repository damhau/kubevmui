from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class MigrationPhase(StrEnum):
    pending = "Pending"
    scheduling = "Scheduling"
    scheduled = "Scheduled"
    preparing_target = "PreparingTarget"
    target_ready = "TargetReady"
    running = "Running"
    succeeded = "Succeeded"
    failed = "Failed"


class Migration(BaseModel):
    name: str
    namespace: str
    vm_name: str
    phase: MigrationPhase = MigrationPhase.pending
    source_node: str | None = None
    target_node: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None


class MigrationCreate(BaseModel):
    vm_name: str


class MigrationList(BaseModel):
    items: list[Migration]
    total: int
