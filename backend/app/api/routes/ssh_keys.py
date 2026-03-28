from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.ssh_key import SSHKey, SSHKeyCreate, SSHKeyList
from app.services.ssh_key_service import SSHKeyService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["ssh_keys"],
)


def _get_service(cluster: str, cm: ClusterManager) -> SSHKeyService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return SSHKeyService(KubeVirtClient(api_client))


@router.get("/sshkeys", response_model=SSHKeyList)
def list_ssh_keys(
    cluster: str,
    ns: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_ssh_keys(ns)
    return SSHKeyList(items=items, total=len(items))


@router.post("/sshkeys", response_model=SSHKey, status_code=201)
def create_ssh_key(
    cluster: str,
    ns: str,
    body: SSHKeyCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_ssh_key(ns, body)


@router.delete("/sshkeys/{name}", status_code=204)
def delete_ssh_key(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_ssh_key(ns, name)
