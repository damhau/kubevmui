from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.image import Image, ImageCreate, ImageList
from app.services.image_service import ImageService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["images"],
)


def _get_service(cluster: str, cm: ClusterManager) -> ImageService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return ImageService(KubeVirtClient(api_client))


@router.get("/images", response_model=ImageList)
def list_images(
    cluster: str,
    ns: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_images(ns)
    return ImageList(items=items, total=len(items))


@router.post("/images", response_model=Image, status_code=201)
def create_image(
    cluster: str,
    ns: str,
    body: ImageCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_image(ns, body)


@router.delete("/images/{name}", status_code=204)
def delete_image(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_image(ns, name)
