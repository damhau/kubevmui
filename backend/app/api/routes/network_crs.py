from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.network_cr import NetworkCR, NetworkCRCreate, NetworkCRList, NetworkCRUpdate
from app.services.network_cr_service import NetworkCRService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["network-crs"],
)


def _get_service(cluster: str, cm: ClusterManager) -> NetworkCRService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return NetworkCRService(KubeVirtClient(api_client))


@router.get("/network-crs", response_model=NetworkCRList)
def list_network_crs(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_networks()
    return NetworkCRList(items=items, total=len(items))


@router.get("/network-crs/{name}", response_model=NetworkCR)
def get_network_cr(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    cr = svc.get_network(name)
    if cr is None:
        raise HTTPException(status_code=404, detail=f"Network '{name}' not found")
    return cr


@router.post("/network-crs/preview")
def preview_network_cr(
    cluster: str,
    body: NetworkCRCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.preview_network(body)


@router.post("/network-crs", response_model=NetworkCR, status_code=201)
def create_network_cr(
    cluster: str,
    body: NetworkCRCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_network(body)


@router.put("/network-crs/{name}", response_model=NetworkCR)
def update_network_cr(
    cluster: str,
    name: str,
    body: NetworkCRUpdate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.update_network(name, body)


@router.delete("/network-crs/{name}", status_code=204)
def delete_network_cr(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_network(name)
