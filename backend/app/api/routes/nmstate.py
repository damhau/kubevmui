from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.models.nmstate import NNCP, NNCPCreate, NNCPList, NodeNetworkState
from app.services.nmstate_service import NMStateService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["nmstate"],
)


def _get_service(cluster: str, cm: ClusterManager) -> NMStateService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return NMStateService(api_client)


@router.get("/nmstate/nncps", response_model=NNCPList)
def list_nncps(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_nncps()
    return NNCPList(items=items, total=len(items))


@router.post("/nmstate/nncps", response_model=NNCP, status_code=201)
def create_nncp(
    cluster: str,
    body: NNCPCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_nncp(body)


@router.delete("/nmstate/nncps/{name}", status_code=204)
def delete_nncp(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_nncp(name)


@router.get("/nmstate/bridges")
def list_bridges(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return {"items": svc.list_bridges()}


@router.get("/nmstate/interfaces")
def list_node_interfaces(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return {"items": svc.list_node_interfaces()}


@router.get("/nodes/{node_name}/network-state", response_model=NodeNetworkState)
def get_node_network_state(
    cluster: str,
    node_name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    nns = svc.get_node_network_state(node_name)
    if nns is None:
        raise HTTPException(
            status_code=404, detail=f"Network state for node '{node_name}' not found"
        )
    return nns
