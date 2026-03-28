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
