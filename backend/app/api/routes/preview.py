from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.disk import DiskCreate
from app.models.image import ImageCreate
from app.models.network_profile import NetworkProfileCreate
from app.models.snapshot import SnapshotCreate
from app.models.ssh_key import SSHKeyCreate
from app.models.template import TemplateCreate
from app.models.vm import VMCreate
from app.services.image_service import ImageService
from app.services.network_service import NetworkService
from app.services.snapshot_service import SnapshotService
from app.services.ssh_key_service import SSHKeyService
from app.services.storage_service import StorageService
from app.services.template_service import TemplateService
from app.services.vm_service import VMService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["preview"],
)


def _wrap(manifests: list[dict]) -> dict:
    return {"resources": [{"kind": m.get("kind", "Unknown"), "manifest": m} for m in manifests]}


@router.post("/vms/preview")
def preview_vm(
    cluster: str,
    ns: str,
    body: VMCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = VMService(KubeVirtClient(api_client))
    return _wrap(svc.preview_vm(body))


@router.post("/images/preview")
def preview_image(
    cluster: str,
    ns: str,
    body: ImageCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = ImageService(KubeVirtClient(api_client))
    return _wrap(svc.preview_image(body))


@router.post("/networks/preview")
def preview_network(
    cluster: str,
    ns: str,
    body: NetworkProfileCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = NetworkService(api_client)
    return _wrap(svc.preview_profile(body))


@router.post("/sshkeys/preview")
def preview_ssh_key(
    cluster: str,
    ns: str,
    body: SSHKeyCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = SSHKeyService(KubeVirtClient(api_client))
    return _wrap(svc.preview_ssh_key(ns, body))


@router.post("/templates/preview")
def preview_template(
    cluster: str,
    ns: str,
    body: TemplateCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = TemplateService(KubeVirtClient(api_client))
    return _wrap(svc.preview_template(body))


@router.post("/disks/preview")
def preview_disk(
    cluster: str,
    ns: str,
    body: DiskCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = StorageService(api_client)
    return _wrap(svc.preview_disk(body))


@router.post("/snapshots/preview")
def preview_snapshot(
    cluster: str,
    ns: str,
    body: SnapshotCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    svc = SnapshotService(KubeVirtClient(api_client))
    return _wrap(svc.preview_snapshot(ns, body))
