from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.network_profile import NetworkProfile, NetworkProfileCreate, NetworkProfileList
from app.services.network_service import NetworkService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["networks"],
)

cluster_router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["networks"],
)


@cluster_router.get("/networks/all")
def list_all_networks(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    kv = KubeVirtClient(api_client)
    custom_api = kv.custom_api
    result = custom_api.list_cluster_custom_object(
        group="k8s.cni.cncf.io",
        version="v1",
        plural="network-attachment-definitions",
    )
    items = []
    for nad in result.get("items", []):
        metadata = nad.get("metadata", {})
        ns = metadata.get("namespace", "")
        name = metadata.get("name", "")
        items.append({
            "name": name,
            "namespace": ns,
            "full_name": f"{ns}/{name}" if ns else name,
            "display_name": metadata.get("annotations", {}).get(
                "kubevmui.io/display-name", name
            ),
        })
    return {"items": items, "total": len(items)}


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
