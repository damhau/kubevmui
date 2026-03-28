from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.models.network_profile import NetworkProfile, NetworkProfileCreate, NetworkProfileList
from app.services.network_service import NetworkService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["networks"],
)


def _get_service(cluster: str, cm: ClusterManager) -> NetworkService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return NetworkService(api_client)


@router.get("/networks", response_model=NetworkProfileList)
def list_networks(
    cluster: str,
    ns: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_profiles(ns)
    return NetworkProfileList(items=items, total=len(items))


@router.post("/networks", response_model=NetworkProfile, status_code=201)
def create_network(
    cluster: str,
    ns: str,
    body: NetworkProfileCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_profile(body)


@router.delete("/networks/{name}", status_code=204)
def delete_network(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_profile(ns, name)
