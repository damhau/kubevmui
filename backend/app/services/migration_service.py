from datetime import UTC, datetime

from app.core.k8s_client import KubeVirtClient
from app.models.migration import Migration, MigrationCreate, MigrationPhase


def _migration_from_raw(raw: dict) -> Migration:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    status = raw.get("status", {})

    phase_str = status.get("phase", "Pending")
    phase_map = {
        "Pending": MigrationPhase.pending,
        "Scheduling": MigrationPhase.scheduling,
        "Scheduled": MigrationPhase.scheduled,
        "PreparingTarget": MigrationPhase.preparing_target,
        "TargetReady": MigrationPhase.target_ready,
        "Running": MigrationPhase.running,
        "Succeeded": MigrationPhase.succeeded,
        "Failed": MigrationPhase.failed,
    }
    phase = phase_map.get(phase_str, MigrationPhase.pending)

    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            created_at = datetime.now(tz=UTC)

    completed_at = None
    migration_state = status.get("migrationState", {})
    end_ts = migration_state.get("endTimestamp")
    if end_ts:
        try:
            completed_at = datetime.fromisoformat(end_ts.replace("Z", "+00:00"))
        except ValueError:
            pass

    return Migration(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        vm_name=spec.get("vmiName", ""),
        phase=phase,
        source_node=migration_state.get("sourceNode"),
        target_node=migration_state.get("targetNode") or migration_state.get("targetNodeAddress"),
        created_at=created_at,
        completed_at=completed_at,
    )


class MigrationService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_migrations(self, namespace: str, vm_name: str | None = None) -> list[Migration]:
        raw_list = self.kv.list_migrations(namespace)
        migrations = [_migration_from_raw(m) for m in raw_list]
        if vm_name:
            migrations = [m for m in migrations if m.vm_name == vm_name]
        return migrations

    def get_migration(self, namespace: str, name: str) -> Migration | None:
        raw = self.kv.get_migration(namespace, name)
        if raw is None:
            return None
        return _migration_from_raw(raw)

    def create_migration(self, namespace: str, request: MigrationCreate) -> Migration:
        migration_name = f"migrate-{request.vm_name}-{int(datetime.now(tz=UTC).timestamp())}"
        manifest = {
            "apiVersion": "kubevirt.io/v1",
            "kind": "VirtualMachineInstanceMigration",
            "metadata": {
                "name": migration_name,
                "namespace": namespace,
            },
            "spec": {
                "vmiName": request.vm_name,
            },
        }
        raw = self.kv.create_migration(namespace, manifest)
        return _migration_from_raw(raw)

    def cancel_migration(self, namespace: str, name: str) -> None:
        self.kv.delete_migration(namespace, name)
