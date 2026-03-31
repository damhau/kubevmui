from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.services.kubevirt_info_service import KubeVirtInfoService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["kubevirt-info"],
)


@router.get("/kubevirt-info")
def get_kubevirt_info(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    svc = KubeVirtInfoService(KubeVirtClient(api_client))
    info = svc.get_info()
    if info is None:
        raise HTTPException(status_code=404, detail="KubeVirt CR not found")
    return info.model_dump()
