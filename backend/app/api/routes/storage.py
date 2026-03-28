from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.models.disk import Disk, DiskCreate, DiskList
from app.services.storage_service import StorageService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["storage"],
)


def _get_service(cluster: str, cm: ClusterManager) -> StorageService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return StorageService(api_client)


@router.get("/namespaces/{ns}/disks", response_model=DiskList)
def list_disks(
    cluster: str,
    ns: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_disks(ns)
    return DiskList(items=items, total=len(items))


@router.post("/namespaces/{ns}/disks", response_model=Disk, status_code=201)
def create_disk(
    cluster: str,
    ns: str,
    body: DiskCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_disk(body)


@router.delete("/namespaces/{ns}/disks/{name}", status_code=204)
def delete_disk(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_disk(ns, name)
