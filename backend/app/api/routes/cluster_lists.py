"""Cluster-scoped list endpoints for all-namespace browsing."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.services.storage_service import StorageService
from app.services.vm_service import VMService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["cluster-lists"],
)


def _get_kv(cluster: str, cm: ClusterManager) -> KubeVirtClient:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return KubeVirtClient(api_client)


@router.get("/all/vms")
def list_all_vms(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    kv = _get_kv(cluster, cm)
    svc = VMService(kv)
    all_vms = []
    for ns in kv.list_namespaces():
        try:
            all_vms.extend(svc.list_vms(ns))
        except Exception:
            continue
    return {"items": [vm.model_dump() for vm in all_vms], "total": len(all_vms)}


@router.get("/all/disks")
def list_all_disks(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    kv = _get_kv(cluster, cm)
    api_client = cm.get_api_client(cluster)
    svc = StorageService(api_client)
    all_items = []
    for ns in kv.list_namespaces():
        try:
            all_items.extend(svc.list_disks(ns))
        except Exception:
            continue
    return {"items": [i.model_dump() for i in all_items], "total": len(all_items)}
