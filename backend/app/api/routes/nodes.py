from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.services.vm_service import VMService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["nodes"],
)


@router.get("/nodes")
def list_nodes(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    kv = KubeVirtClient(api_client)
    nodes = kv.list_nodes()
    svc = VMService(kv)

    # Count VMs per node across all namespaces
    vm_node_count: dict[str, int] = {}
    for ns in kv.list_namespaces():
        try:
            vms = svc.list_vms(ns)
            for vm in vms:
                if vm.node:
                    vm_node_count[vm.node] = vm_node_count.get(vm.node, 0) + 1
        except Exception:
            continue

    # Enrich nodes with VM count
    for node in nodes:
        node["vm_count"] = vm_node_count.get(node["name"], 0)

    return {"items": nodes, "total": len(nodes)}


@router.get("/nodes/{name}")
def get_node(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    kv = KubeVirtClient(api_client)
    nodes = kv.list_nodes()
    node = next((n for n in nodes if n["name"] == name), None)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{name}' not found")

    # Get VMs running on this node
    svc = VMService(kv)
    node_vms = []
    for ns in kv.list_namespaces():
        try:
            vms = svc.list_vms(ns)
            for vm in vms:
                if vm.node == name:
                    node_vms.append({
                        "name": vm.name,
                        "namespace": vm.namespace,
                        "status": vm.status.value,
                        "cpu_cores": vm.compute.cpu_cores,
                        "memory_mb": vm.compute.memory_mb,
                    })
        except Exception:
            continue

    node["vms"] = node_vms
    node["vm_count"] = len(node_vms)
    node["raw_manifest"] = kv.get_node_raw(name)
    return node
