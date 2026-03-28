from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["namespaces"],
)


@router.get("/namespaces")
def list_namespaces(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    kv = KubeVirtClient(api_client)
    namespaces = kv.list_namespaces()
    return {"items": namespaces, "total": len(namespaces)}
