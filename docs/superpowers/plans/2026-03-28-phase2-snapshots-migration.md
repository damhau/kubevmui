# Phase 2A: Snapshots + Live Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VM snapshot (create, restore, delete) and live migration (trigger, cancel, monitor progress) capabilities to kubevmui, with both backend API endpoints and frontend UI integrated into the VM detail page.

**Architecture:** New K8s client methods for snapshot/migration CRDs → service layers with domain model conversion → FastAPI routes → React Query hooks → VM detail page tabs. Follows the exact same patterns as existing VM/Disk/Network resources.

**Tech Stack:** Same as Phase 1. KubeVirt CRDs: `snapshot.kubevirt.io/v1beta1` (snapshots/restores), `kubevirt.io/v1` (migrations).

---

## Track A: Backend

### Task A1: Snapshot Models

**Files:**
- Create: `backend/app/models/snapshot.py`

- [x] **Step 1: Create snapshot models**

```python
# backend/app/models/snapshot.py
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
```

- [x] **Step 2: Commit**

```bash
git add backend/app/models/snapshot.py
git commit -m "feat: add snapshot and restore Pydantic models"
```

---

### Task A2: Migration Models

**Files:**
- Create: `backend/app/models/migration.py`

- [x] **Step 1: Create migration models**

```python
# backend/app/models/migration.py
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
```

- [x] **Step 2: Commit**

```bash
git add backend/app/models/migration.py
git commit -m "feat: add migration Pydantic models"
```

---

### Task A3: K8s Client — Snapshot and Migration Methods

**Files:**
- Modify: `backend/app/core/k8s_client.py`

- [x] **Step 1: Add snapshot constants and methods to KubeVirtClient**

Add after the existing constants at the top of the class:

```python
    SNAPSHOT_API_GROUP = "snapshot.kubevirt.io"
    SNAPSHOT_API_VERSION = "v1beta1"
```

Add these methods to the `KubeVirtClient` class:

```python
    # --- Snapshots ---

    def list_snapshots(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinesnapshots",
        )
        return result.get("items", [])

    def get_snapshot(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
                namespace=namespace, plural="virtualmachinesnapshots", name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_snapshot(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinesnapshots", body=body,
        )

    def delete_snapshot(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinesnapshots", name=name,
        )

    def create_restore(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinerestores", body=body,
        )

    def list_restores(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinerestores",
        )
        return result.get("items", [])

    # --- Migrations ---

    def list_migrations(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstancemigrations",
        )
        return result.get("items", [])

    def get_migration(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
                namespace=namespace, plural="virtualmachineinstancemigrations", name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_migration(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstancemigrations", body=body,
        )

    def delete_migration(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstancemigrations", name=name,
        )
```

- [x] **Step 2: Verify imports work**

```bash
cd backend && uv run python -c "from app.core.k8s_client import KubeVirtClient; print('OK')"
```

- [x] **Step 3: Commit**

```bash
git add backend/app/core/k8s_client.py
git commit -m "feat: add snapshot and migration methods to K8s client"
```

---

### Task A4: Snapshot Service

**Files:**
- Create: `backend/app/services/snapshot_service.py`

- [x] **Step 1: Implement SnapshotService**

```python
# backend/app/services/snapshot_service.py
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
        raw = self.kv.create_restore(namespace, manifest)
        return _restore_from_raw(raw)
```

- [x] **Step 2: Verify import**

```bash
cd backend && uv run python -c "from app.services.snapshot_service import SnapshotService; print('OK')"
```

- [x] **Step 3: Commit**

```bash
git add backend/app/services/snapshot_service.py
git commit -m "feat: add snapshot service with create, list, delete, restore"
```

---

### Task A5: Migration Service

**Files:**
- Create: `backend/app/services/migration_service.py`

- [x] **Step 1: Implement MigrationService**

```python
# backend/app/services/migration_service.py
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
```

- [x] **Step 2: Verify import**

```bash
cd backend && uv run python -c "from app.services.migration_service import MigrationService; print('OK')"
```

- [x] **Step 3: Commit**

```bash
git add backend/app/services/migration_service.py
git commit -m "feat: add migration service with create, list, cancel"
```

---

### Task A6: Snapshot API Routes

**Files:**
- Create: `backend/app/api/routes/snapshots.py`
- Modify: `backend/app/main.py`

- [x] **Step 1: Implement snapshot routes**

```python
# backend/app/api/routes/snapshots.py
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.snapshot import Restore, RestoreCreate, Snapshot, SnapshotCreate, SnapshotList
from app.services.snapshot_service import SnapshotService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["snapshots"],
)


def _get_service(cluster: str, cm: ClusterManager) -> SnapshotService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return SnapshotService(KubeVirtClient(api_client))


@router.get("/snapshots", response_model=SnapshotList)
def list_snapshots(
    cluster: str,
    ns: str,
    vm: str | None = None,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_snapshots(ns, vm_name=vm)
    return SnapshotList(items=items, total=len(items))


@router.get("/snapshots/{name}", response_model=Snapshot)
def get_snapshot(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    snap = svc.get_snapshot(ns, name)
    if snap is None:
        raise HTTPException(status_code=404, detail=f"Snapshot '{name}' not found")
    return snap


@router.post("/vms/{vm_name}/snapshots", response_model=Snapshot, status_code=201)
def create_snapshot(
    cluster: str,
    ns: str,
    vm_name: str,
    body: SnapshotCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_snapshot(ns, body)


@router.delete("/snapshots/{name}", status_code=204)
def delete_snapshot(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_snapshot(ns, name)


@router.post("/vms/{vm_name}/snapshots/{snapshot_name}/restore", response_model=Restore, status_code=201)
def restore_snapshot(
    cluster: str,
    ns: str,
    vm_name: str,
    snapshot_name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    request = RestoreCreate(snapshot_name=snapshot_name)
    return svc.restore_snapshot(ns, vm_name, request)
```

- [x] **Step 2: Register in main.py**

Add to imports:
```python
from app.api.routes import auth, dashboard, namespaces, networks, snapshots, storage, templates, vms
```

Add to `create_app()`:
```python
    application.include_router(snapshots.router)
```

- [x] **Step 3: Verify server starts**

```bash
cd backend && uv run python -c "from app.main import app; print([r.path for r in app.routes if 'snapshot' in r.path])"
```

- [x] **Step 4: Commit**

```bash
git add backend/app/api/routes/snapshots.py backend/app/main.py
git commit -m "feat: add snapshot API routes (list, get, create, delete, restore)"
```

---

### Task A7: Migration API Routes

**Files:**
- Create: `backend/app/api/routes/migrations.py`
- Modify: `backend/app/main.py`

- [x] **Step 1: Implement migration routes**

```python
# backend/app/api/routes/migrations.py
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.migration import Migration, MigrationCreate, MigrationList
from app.services.migration_service import MigrationService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["migrations"],
)


def _get_service(cluster: str, cm: ClusterManager) -> MigrationService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return MigrationService(KubeVirtClient(api_client))


@router.get("/migrations", response_model=MigrationList)
def list_migrations(
    cluster: str,
    ns: str,
    vm: str | None = None,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_migrations(ns, vm_name=vm)
    return MigrationList(items=items, total=len(items))


@router.post("/vms/{vm_name}/migrate", response_model=Migration, status_code=201)
def create_migration(
    cluster: str,
    ns: str,
    vm_name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    request = MigrationCreate(vm_name=vm_name)
    return svc.create_migration(ns, request)


@router.delete("/migrations/{name}", status_code=204)
def cancel_migration(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.cancel_migration(ns, name)
```

- [x] **Step 2: Register in main.py**

Add to imports:
```python
from app.api.routes import auth, dashboard, migrations, namespaces, networks, snapshots, storage, templates, vms
```

Add to `create_app()`:
```python
    application.include_router(migrations.router)
```

- [x] **Step 3: Verify server starts**

```bash
cd backend && uv run python -c "from app.main import app; print([r.path for r in app.routes if 'migrat' in r.path])"
```

- [x] **Step 4: Commit**

```bash
git add backend/app/api/routes/migrations.py backend/app/main.py
git commit -m "feat: add migration API routes (list, create, cancel)"
```

---

## Track B: Frontend

### Task B1: Snapshot and Migration Hooks

**Files:**
- Create: `frontend/src/hooks/useSnapshots.ts`
- Create: `frontend/src/hooks/useMigrations.ts`

- [x] **Step 1: Create snapshot hooks**

```typescript
// frontend/src/hooks/useSnapshots.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useSnapshots(namespace: string, vmName?: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['snapshots', activeCluster, namespace, vmName],
    queryFn: async () => {
      const params = vmName ? `?vm=${vmName}` : ''
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/snapshots${params}`
      )
      return data
    },
    refetchInterval: 5000,
  })
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, snapshotName }: { namespace: string; vmName: string; snapshotName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/snapshots`,
        { name: snapshotName, vm_name: vmName }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, name }: { namespace: string; name: string }) => {
      await apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/snapshots/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })
}

export function useRestoreSnapshot() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, snapshotName }: { namespace: string; vmName: string; snapshotName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/snapshots/${snapshotName}/restore`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
```

- [x] **Step 2: Create migration hooks**

```typescript
// frontend/src/hooks/useMigrations.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useMigrations(namespace: string, vmName?: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['migrations', activeCluster, namespace, vmName],
    queryFn: async () => {
      const params = vmName ? `?vm=${vmName}` : ''
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/migrations${params}`
      )
      return data
    },
    refetchInterval: 3000,
  })
}

export function useCreateMigration() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName }: { namespace: string; vmName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/migrate`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrations'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useCancelMigration() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, name }: { namespace: string; name: string }) => {
      await apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/migrations/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrations'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
```

- [x] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add frontend/src/hooks/useSnapshots.ts frontend/src/hooks/useMigrations.ts
git commit -m "feat: add snapshot and migration React Query hooks"
```

---

### Task B2: Snapshots Tab on VM Detail Page

**Files:**
- Modify: `frontend/src/pages/VMDetailPage.tsx`

- [x] **Step 1: Add snapshots tab to VMDetailPage**

Update the `Tab` type and `tabs` array:

```typescript
type Tab = 'overview' | 'snapshots' | 'events' | 'yaml'
```

```typescript
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'events', label: 'Events' },
    { id: 'yaml', label: 'YAML' },
  ]
```

Add imports at top:
```typescript
import { useSnapshots, useCreateSnapshot, useDeleteSnapshot, useRestoreSnapshot } from '@/hooks/useSnapshots'
```

Add state and hooks inside the component (after existing hooks):
```typescript
  const { data: snapshotData } = useSnapshots(namespace!, name!)
  const createSnapshot = useCreateSnapshot()
  const deleteSnapshot = useDeleteSnapshot()
  const restoreSnapshot = useRestoreSnapshot()
  const [showSnapshotForm, setShowSnapshotForm] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  const snapshots = Array.isArray(snapshotData?.items) ? snapshotData.items : []
```

Add the snapshots tab content (after the overview tab section, before the events tab section). This should use the `frontend-design` skill to build a proper tab with:
- A table showing snapshots: name, phase (badge), ready (checkmark/x), created time, actions (restore, delete)
- A "Take Snapshot" button that opens an inline form (snapshot name input + create button)
- Restore and delete actions with confirmation
- Error display for failed operations
- Loading/pending states for mutations

The tab panel renders when `activeTab === 'snapshots'` and uses the same card styling pattern as the overview tab (`background: theme.main.card`, `border`, `borderRadius: theme.radius.lg`, `padding: 24`).

- [x] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/pages/VMDetailPage.tsx
git commit -m "feat: add snapshots tab to VM detail page"
```

---

### Task B3: Migration Actions on VM Detail Page

**Files:**
- Modify: `frontend/src/pages/VMDetailPage.tsx`

- [x] **Step 1: Add migration controls to VMDetailPage**

Add imports:
```typescript
import { useMigrations, useCreateMigration, useCancelMigration } from '@/hooks/useMigrations'
```

Add hooks in the component:
```typescript
  const { data: migrationData } = useMigrations(namespace!, name!)
  const createMigration = useCreateMigration()
  const cancelMigration = useCancelMigration()

  const migrations = Array.isArray(migrationData?.items) ? migrationData.items : []
  const activeMigration = migrations.find((m: any) =>
    m.vm_name === name && !['Succeeded', 'Failed'].includes(m.phase)
  )
```

Add a migration status banner in the overview tab (above the info rows) that shows when a migration is active:
- If `activeMigration` exists: show a banner with phase, source/target nodes, and a "Cancel" button
- If VM status is "Running" and no active migration: show a "Migrate" button in the action bar at the top of the page (next to Start/Stop/Restart)

Add a "Migrate" button to the action buttons area of the VM detail page (the existing area with Start/Stop/Restart/Delete buttons). The button should:
- Only show when VM status is "running"
- Be disabled when a migration is already active
- Call `createMigration.mutate({ namespace, vmName: name })`
- Show "Migrating..." while pending

- [x] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/pages/VMDetailPage.tsx
git commit -m "feat: add migration controls to VM detail page"
```

---

### Task B4: Snapshot and Migrate Actions in VM List Page

**Files:**
- Modify: `frontend/src/pages/VMListPage.tsx`

- [x] **Step 1: Add snapshot and migrate quick actions to VM list**

The VM list page already has inline action buttons (Start/Stop/Restart/Delete). Add two more actions to each VM row:

- **Snapshot**: Quick snapshot button that creates a snapshot with auto-generated name `snap-{vmName}-{timestamp}`
- **Migrate**: Quick migrate button (only shown for running VMs)

Import the hooks:
```typescript
import { useCreateSnapshot } from '@/hooks/useSnapshots'
import { useCreateMigration } from '@/hooks/useMigrations'
```

Add the hooks in the component and add the action buttons to the existing action menu for each VM row.

- [x] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 4: Commit**

```bash
git add frontend/src/pages/VMListPage.tsx
git commit -m "feat: add snapshot and migrate quick actions to VM list"
```

---

## Integration

### Task I1: End-to-End Verification

- [x] **Step 1: Verify backend starts and routes are registered**

```bash
cd backend && uv run python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
for r in sorted(routes):
    if 'snapshot' in r or 'migrat' in r:
        print(r)
"
```

Expected output should include snapshot and migration routes.

- [x] **Step 2: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [x] **Step 3: Test snapshot API against live cluster**

```bash
# List snapshots (should return empty list)
curl -s http://localhost:8000/api/v1/clusters/local/namespaces/default/snapshots | python3 -m json.tool
```

Expected: `{"items": [], "total": 0}`

- [x] **Step 4: Test migration API against live cluster**

```bash
# List migrations
curl -s http://localhost:8000/api/v1/clusters/local/namespaces/default/migrations | python3 -m json.tool
```

Expected: `{"items": [], "total": 0}` (or list of past migrations)

- [x] **Step 5: Commit any integration fixes**

```bash
git add -A
git commit -m "feat: Phase 2A snapshots and migration complete"
```
