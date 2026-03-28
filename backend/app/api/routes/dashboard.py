from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.common import VMStatus
from app.services.vm_service import VMService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["dashboard"],
)


@router.get("/dashboard")
def get_dashboard(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    kv = KubeVirtClient(api_client)
    namespaces = kv.list_namespaces()
    nodes = kv.list_nodes()

    svc = VMService(kv)

    total_vms = 0
    running_vms = 0
    stopped_vms = 0
    error_vms = 0

    for ns in namespaces:
        try:
            vms = svc.list_vms(ns)
        except Exception:
            continue
        for vm in vms:
            total_vms += 1
            if vm.status == VMStatus.running:
                running_vms += 1
            elif vm.status == VMStatus.stopped:
                stopped_vms += 1
            elif vm.status == VMStatus.error:
                error_vms += 1

    return {
        "total_vms": total_vms,
        "running_vms": running_vms,
        "stopped_vms": stopped_vms,
        "error_vms": error_vms,
        "node_count": len(nodes),
    }
