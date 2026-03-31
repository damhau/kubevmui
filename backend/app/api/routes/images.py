from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

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


@router.get("/images/{name}", response_model=Image)
def get_image(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    img = svc.get_image(ns, name)
    if img is None:
        raise HTTPException(status_code=404, detail=f"Image '{name}' not found")
    return img


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


@router.post("/images/upload", response_model=Image, status_code=201)
async def upload_image(
    cluster: str,
    ns: str,
    file: UploadFile = File(...),
    name: str = Form(...),
    display_name: str = Form(...),
    description: str = Form(""),
    os_type: str = Form("linux"),
    size_gb: int = Form(20),
    storage_class: str = Form(""),
    is_global: bool = Form(False),
    media_type: str = Form("disk"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)

    image_create = ImageCreate(
        name=name,
        display_name=display_name,
        description=description,
        os_type=os_type,
        source_type="upload",
        source_url="",
        size_gb=size_gb,
        storage_class=storage_class,
        is_global=is_global,
        media_type=media_type,
    )
    image = svc.create_image(ns, image_create)

    # Stream file to CDI in chunks (avoids loading entire file in memory)
    import logging

    try:
        svc.upload_image_stream(ns, name, file.file)
    except Exception as e:
        logging.getLogger(__name__).exception("Upload to CDI failed")
        raise HTTPException(status_code=502, detail=f"Upload to CDI failed: {str(e)[:500]}") from e

    return image


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
