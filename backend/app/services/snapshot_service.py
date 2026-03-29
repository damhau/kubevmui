import time
from datetime import UTC, datetime

from app.core.k8s_client import KubeVirtClient
from app.models.snapshot import (
    Restore,
    RestoreCreate,
    Snapshot,
    SnapshotCreate,
    SnapshotList,
    SnapshotPhase,
)

STOP_TIMEOUT = 120
RESTORE_TIMEOUT = 120
POLL_INTERVAL = 2


def _snapshot_from_raw(raw: dict) -> Snapshot:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    status = raw.get("status", {})

    phase_str = status.get("phase", "Unknown")
    phase_map = {
        "InProgress": SnapshotPhase.in_progress,
        "Succeeded": SnapshotPhase.succeeded,
        "Failed": SnapshotPhase.failed,
    }
    phase = phase_map.get(phase_str, SnapshotPhase.unknown)
    if not status:
        phase = SnapshotPhase.pending

    creation_time = None
    ct = status.get("creationTime")
    if ct:
        try:
            creation_time = datetime.fromisoformat(ct.replace("Z", "+00:00"))
        except ValueError:
            pass

    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            created_at = datetime.now(tz=UTC)

    error_message = None
    conditions = status.get("conditions", [])
    for c in conditions:
        if c.get("type") == "Failure" and c.get("status") == "True":
            error_message = c.get("message", "Unknown error")
            break

    return Snapshot(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        vm_name=spec.get("source", {}).get("name", ""),
        phase=phase,
        ready_to_use=status.get("readyToUse", False),
        creation_time=creation_time,
        created_at=created_at,
        error_message=error_message,
    )


def _restore_from_raw(raw: dict) -> Restore:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    status = raw.get("status", {})

    restore_time = None
    rt = status.get("restoreTime")
    if rt:
        try:
            restore_time = datetime.fromisoformat(rt.replace("Z", "+00:00"))
        except ValueError:
            pass

    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            created_at = datetime.now(tz=UTC)

    return Restore(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        vm_name=spec.get("target", {}).get("name", ""),
        snapshot_name=spec.get("virtualMachineSnapshotName", ""),
        complete=status.get("complete", False),
        restore_time=restore_time,
        created_at=created_at,
    )


class SnapshotService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_snapshots(self, namespace: str, vm_name: str | None = None) -> list[Snapshot]:
        raw_list = self.kv.list_snapshots(namespace)
        snapshots = [_snapshot_from_raw(s) for s in raw_list]
        if vm_name:
            snapshots = [s for s in snapshots if s.vm_name == vm_name]
        return snapshots

    def get_snapshot(self, namespace: str, name: str) -> Snapshot | None:
        raw = self.kv.get_snapshot(namespace, name)
        if raw is None:
            return None
        return _snapshot_from_raw(raw)

    def preview_snapshot(self, namespace: str, request: SnapshotCreate) -> list[dict]:
        manifest = {
            "apiVersion": "snapshot.kubevirt.io/v1beta1",
            "kind": "VirtualMachineSnapshot",
            "metadata": {
                "name": request.name,
                "namespace": namespace,
            },
            "spec": {
                "source": {
                    "apiGroup": "kubevirt.io",
                    "kind": "VirtualMachine",
                    "name": request.vm_name,
                },
            },
        }
        return [manifest]

    def create_snapshot(self, namespace: str, request: SnapshotCreate) -> Snapshot:
        manifest = {
            "apiVersion": "snapshot.kubevirt.io/v1beta1",
            "kind": "VirtualMachineSnapshot",
            "metadata": {
                "name": request.name,
                "namespace": namespace,
            },
            "spec": {
                "source": {
                    "apiGroup": "kubevirt.io",
                    "kind": "VirtualMachine",
                    "name": request.vm_name,
                },
            },
        }
        raw = self.kv.create_snapshot(namespace, manifest)
        return _snapshot_from_raw(raw)

    def delete_snapshot(self, namespace: str, name: str) -> None:
        self.kv.delete_snapshot(namespace, name)

    def restore_snapshot(self, namespace: str, vm_name: str, request: RestoreCreate) -> Restore:
        # Check if VM is currently running
        was_running = self.kv.get_vmi(namespace, vm_name) is not None

        # Stop the VM if running — restore requires the VM to be off
        if was_running:
            self.kv.vm_action(namespace, vm_name, "stop")
            self._wait_for_vm_stopped(namespace, vm_name)

        # Clean up any existing restores targeting this VM (stale or incomplete)
        self._cleanup_restores(namespace, vm_name)

        # Create the VirtualMachineRestore CR
        restore_name = f"restore-{request.snapshot_name}-{int(datetime.now(tz=UTC).timestamp())}"
        manifest = {
            "apiVersion": "snapshot.kubevirt.io/v1beta1",
            "kind": "VirtualMachineRestore",
            "metadata": {
                "name": restore_name,
                "namespace": namespace,
            },
            "spec": {
                "target": {
                    "apiGroup": "kubevirt.io",
                    "kind": "VirtualMachine",
                    "name": vm_name,
                },
                "virtualMachineSnapshotName": request.snapshot_name,
            },
        }
        try:
            self.kv.create_restore(namespace, manifest)
            restore = self._wait_for_restore_complete(namespace, restore_name)
        except Exception:
            # Best-effort restart if restore fails and VM was running
            if was_running:
                try:
                    self.kv.vm_action(namespace, vm_name, "start")
                except Exception:
                    pass
            raise

        # Restart VM if it was running before
        if was_running:
            self.kv.vm_action(namespace, vm_name, "start")

        return restore

    def _cleanup_restores(self, namespace: str, vm_name: str) -> None:
        for r in self.kv.list_restores(namespace):
            target = r.get("spec", {}).get("target", {}).get("name")
            if target == vm_name:
                name = r.get("metadata", {}).get("name", "")
                try:
                    self.kv.delete_restore(namespace, name)
                except Exception:
                    pass

    def _wait_for_vm_stopped(self, namespace: str, vm_name: str) -> None:
        deadline = time.monotonic() + STOP_TIMEOUT
        while time.monotonic() < deadline:
            if self.kv.get_vmi(namespace, vm_name) is None:
                return
            time.sleep(POLL_INTERVAL)
        raise TimeoutError(f"VM '{vm_name}' did not stop within {STOP_TIMEOUT}s")

    def _wait_for_restore_complete(self, namespace: str, restore_name: str) -> Restore:
        deadline = time.monotonic() + RESTORE_TIMEOUT
        while time.monotonic() < deadline:
            raw = self.kv.get_restore(namespace, restore_name)
            if raw and raw.get("status", {}).get("complete"):
                return _restore_from_raw(raw)
            time.sleep(POLL_INTERVAL)
        raise TimeoutError(f"Restore '{restore_name}' did not complete within {RESTORE_TIMEOUT}s")
