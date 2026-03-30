from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cluster_manager, get_current_user
from app.api.routes.audit import get_audit_service
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.vm import (
    VM,
    AddDiskToSpecRequest,
    AddInterfaceRequest,
    AddInterfaceToSpecRequest,
    AddVolumeRequest,
    VMCloneRequest,
    VMCreate,
    VMList,
    VMPatchRequest,
)
from app.services.network_cr_service import NetworkCRService
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


def _get_services(cluster: str, cm: ClusterManager) -> tuple[VMService, NetworkCRService]:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    kv = KubeVirtClient(api_client)
    return VMService(kv), NetworkCRService(kv)


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


@router.get("/vms/{name}/diagnostics")
def get_vm_diagnostics(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    result = svc.get_diagnostics(ns, name)
    if not result:
        raise HTTPException(status_code=404, detail=f"VM '{name}' not found")
    return result


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
    svc, net_cr_svc = _get_services(cluster, cm)
    result = svc.create_vm(body, net_cr_svc=net_cr_svc)
    audit_svc = get_audit_service()
    audit_svc.record(
        username=_user.username,
        action="create_vm",
        resource_type="VirtualMachine",
        resource_name=body.name,
        namespace=ns,
    )
    return result


@router.delete("/vms/{name}", status_code=204)
def delete_vm(
    cluster: str,
    ns: str,
    name: str,
    delete_storage: bool = Query(False),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_vm(ns, name, delete_storage=delete_storage)
    audit_svc = get_audit_service()
    audit_svc.record(
        username=_user.username,
        action="delete_vm",
        resource_type="VirtualMachine",
        resource_name=name,
        namespace=ns,
        details="with storage" if delete_storage else "",
    )


@router.post("/vms/{name}/clone", status_code=201)
def clone_vm(
    cluster: str,
    ns: str,
    name: str,
    body: VMCloneRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.clone_vm(ns, name, body.new_name)
    audit_svc = get_audit_service()
    audit_svc.record(
        username=_user.username,
        action="clone_vm",
        resource_type="VirtualMachine",
        resource_name=name,
        namespace=ns,
        details=f"Cloned to {body.new_name}",
    )
    return {"status": "ok", "new_name": body.new_name}


@router.post("/vms/{name}/force-stop", status_code=200)
def force_stop_vm(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.force_stop(ns, name)
    audit_svc = get_audit_service()
    audit_svc.record(
        username=_user.username,
        action="force_stop_vm",
        resource_type="VirtualMachine",
        resource_name=name,
        namespace=ns,
    )
    return {"status": "ok"}


@router.patch("/vms/{name}", status_code=200)
def patch_vm(
    cluster: str,
    ns: str,
    name: str,
    body: VMPatchRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    if body.run_strategy:
        svc.update_run_strategy(ns, name, body.run_strategy)
    if body.cpu_cores is not None or body.memory_mb is not None:
        svc.update_compute(ns, name, body.cpu_cores, body.memory_mb)
    return {"status": "ok"}


@router.post("/vms/{name}/disks", status_code=200)
def add_disk_to_spec(
    cluster: str,
    ns: str,
    name: str,
    body: AddDiskToSpecRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.add_disk_to_spec(
        ns,
        name,
        disk_name=body.name,
        bus=body.bus,
        disk_type=body.disk_type,
        size_gb=body.size_gb,
        storage_class=body.storage_class,
        pvc_name=body.pvc_name,
        source_type=body.source_type,
        image_name=body.image_name,
        image_namespace=body.image_namespace,
        image=body.image,
    )
    return {"status": "ok"}


@router.delete("/vms/{name}/disks/{disk_name}", status_code=200)
def remove_disk_from_spec(
    cluster: str,
    ns: str,
    name: str,
    disk_name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.remove_disk_from_spec(ns, name, disk_name)
    return {"status": "ok"}


@router.post("/vms/{name}/nics", status_code=200)
def add_interface_to_spec(
    cluster: str,
    ns: str,
    name: str,
    body: AddInterfaceToSpecRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc, net_cr_svc = _get_services(cluster, cm)
    svc.add_interface_to_spec(
        ns,
        name,
        iface_name=body.name,
        network_cr_name=body.network_cr,
        net_cr_svc=net_cr_svc,
        model=body.model,
        mac_address=body.mac_address,
    )
    return {"status": "ok"}


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
    audit_svc = get_audit_service()
    audit_svc.record(
        username=_user.username,
        action=f"{action}_vm",
        resource_type="VirtualMachine",
        resource_name=name,
        namespace=ns,
    )
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
    svc, net_cr_svc = _get_services(cluster, cm)
    # Ensure NAD exists before hotplugging
    nad_name = net_cr_svc.ensure_nad(ns, body.network_cr)
    if nad_name:
        svc.add_interface(ns, name, body.name, nad_name)
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
