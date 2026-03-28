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
