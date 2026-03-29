"""Cluster-scoped list endpoints for all-namespace browsing."""
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.services.vm_service import VMService
from app.services.image_service import ImageService, _image_from_raw, _merge_dv_status
from app.services.template_service import TemplateService, _cr_to_template
from app.services.storage_service import StorageService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["cluster-lists"],
)


def _get_kv(cluster: str, cm: ClusterManager) -> KubeVirtClient:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return KubeVirtClient(api_client)


@router.get("/all/vms")
def list_all_vms(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    kv = _get_kv(cluster, cm)
    svc = VMService(kv)
    all_vms = []
    for ns in kv.list_namespaces():
        try:
            all_vms.extend(svc.list_vms(ns))
        except Exception:
            continue
    return {"items": [vm.model_dump() for vm in all_vms], "total": len(all_vms)}


@router.get("/all/images")
def list_all_images(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    kv = _get_kv(cluster, cm)
    # Fetch raw CRDs directly per namespace (no global merging)
    all_items = []
    seen = set()
    for ns in kv.list_namespaces():
        try:
            for raw in kv.list_images(ns):
                img = _image_from_raw(raw)
                if img.name not in seen:
                    _merge_dv_status(img, kv)
                    all_items.append(img)
                    seen.add(img.name)
        except Exception:
            continue
    return {"items": [i.model_dump() for i in all_items], "total": len(all_items)}


@router.get("/all/templates")
def list_all_templates(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    kv = _get_kv(cluster, cm)
    # Fetch raw CRDs directly per namespace (no global merging)
    all_items = []
    seen = set()
    for ns in kv.list_namespaces():
        try:
            for raw in kv.list_templates(ns):
                tpl = _cr_to_template(raw)
                if tpl.name not in seen:
                    all_items.append(tpl)
                    seen.add(tpl.name)
        except Exception:
            continue
    return {"items": [i.model_dump() for i in all_items], "total": len(all_items)}


@router.get("/all/disks")
def list_all_disks(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    kv = _get_kv(cluster, cm)
    api_client = cm.get_api_client(cluster)
    svc = StorageService(api_client)
    all_items = []
    for ns in kv.list_namespaces():
        try:
            all_items.extend(svc.list_disks(ns))
        except Exception:
            continue
    return {"items": [i.model_dump() for i in all_items], "total": len(all_items)}
