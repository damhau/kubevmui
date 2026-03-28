from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.vm import VM, VMCreate, VMList, AddVolumeRequest, AddInterfaceRequest
from app.services.vm_service import VMService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["vms"],
)

ALLOWED_ACTIONS = {"start", "stop", "restart", "pause", "unpause"}


def _get_service(cluster: str, cm: ClusterManager) -> VMService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return VMService(KubeVirtClient(api_client))


@router.get("/vms", response_model=VMList)
def list_vms(
    cluster: str,
    ns: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_vms(ns)
    return VMList(items=items, total=len(items))


@router.get("/vms/{name}", response_model=VM)
def get_vm(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    vm = svc.get_vm(ns, name)
    if vm is None:
        raise HTTPException(status_code=404, detail=f"VM '{name}' not found")
    return vm


@router.post("/vms", response_model=VM, status_code=201)
def create_vm(
    cluster: str,
    ns: str,
    body: VMCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_vm(body)


@router.delete("/vms/{name}", status_code=204)
def delete_vm(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_vm(ns, name)


@router.post("/vms/{name}/{action}", status_code=200)
def vm_action(
    cluster: str,
    ns: str,
    name: str,
    action: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    if action not in ALLOWED_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Action '{action}' not allowed. Must be one of: {sorted(ALLOWED_ACTIONS)}",
        )
    svc = _get_service(cluster, cm)
    svc.vm_action(ns, name, action)
    return {"status": "ok", "action": action}


@router.post("/vms/{name}/volumes", status_code=200)
def add_volume(
    cluster: str,
    ns: str,
    name: str,
    body: AddVolumeRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.add_volume(ns, name, body.name, body.pvc_name, body.bus)
    return {"status": "ok"}


@router.delete("/vms/{name}/volumes/{vol_name}", status_code=200)
def remove_volume(
    cluster: str,
    ns: str,
    name: str,
    vol_name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.remove_volume(ns, name, vol_name)
    return {"status": "ok"}


@router.post("/vms/{name}/interfaces", status_code=200)
def add_interface(
    cluster: str,
    ns: str,
    name: str,
    body: AddInterfaceRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.add_interface(ns, name, body.name, body.network_attachment_definition)
    return {"status": "ok"}


@router.delete("/vms/{name}/interfaces/{iface_name}", status_code=200)
def remove_interface(
    cluster: str,
    ns: str,
    name: str,
    iface_name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.remove_interface(ns, name, iface_name)
    return {"status": "ok"}
