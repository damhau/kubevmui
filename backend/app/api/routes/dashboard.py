from datetime import datetime

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
    all_vms = []
    vm_node_count: dict[str, int] = {}

    for ns in namespaces:
        try:
            vms = svc.list_vms(ns)
        except Exception:
            continue
        for vm in vms:
            all_vms.append(vm)
            total_vms += 1
            if vm.status == VMStatus.running:
                running_vms += 1
            elif vm.status == VMStatus.stopped:
                stopped_vms += 1
            elif vm.status == VMStatus.error:
                error_vms += 1
            if vm.node:
                vm_node_count[vm.node] = vm_node_count.get(vm.node, 0) + 1

    # Storage overview
    from app.services.storage_service import StorageService

    storage_svc = StorageService(api_client)
    total_storage_gb = 0
    used_disks = 0
    total_disks = 0
    storage_by_tier: dict[str, dict] = {}

    for ns in namespaces:
        try:
            disks = storage_svc.list_disks(ns)
        except Exception:
            continue
        for disk in disks:
            total_disks += 1
            total_storage_gb += disk.size_gb
            if disk.attached_vm:
                used_disks += 1
            tier = disk.performance_tier or "Unknown"
            if tier not in storage_by_tier:
                storage_by_tier[tier] = {"total_gb": 0, "count": 0}
            storage_by_tier[tier]["total_gb"] += disk.size_gb
            storage_by_tier[tier]["count"] += 1

    # Enrich nodes with VM count
    for node in nodes:
        node["vm_count"] = vm_node_count.get(node["name"], 0)

    return {
        "total_vms": total_vms,
        "running_vms": running_vms,
        "stopped_vms": stopped_vms,
        "error_vms": error_vms,
        "node_count": len(nodes),
        "nodes": nodes,
        "storage_total_gb": total_storage_gb,
        "storage_total_disks": total_disks,
        "storage_attached_disks": used_disks,
        "storage_by_tier": [
            {"tier": tier, "total_gb": info["total_gb"], "count": info["count"]}
            for tier, info in storage_by_tier.items()
        ],
        "recent_vms": [
            {
                "name": vm.name,
                "namespace": vm.namespace,
                "status": vm.status.value,
                "cpu": vm.compute.cpu_cores,
                "memory": f"{vm.compute.memory_mb}Mi",
                "node": vm.node or "\u2014",
            }
            for vm in sorted(
                all_vms,
                key=lambda v: v.created_at or datetime.min,
                reverse=True,
            )[:10]
        ],
    }
