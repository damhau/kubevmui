from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.services.metrics_service import MetricsService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["metrics"],
)


def _get_service(cluster: str, cm: ClusterManager) -> MetricsService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return MetricsService(api_client)


def _parse_range(range_str: str) -> tuple[str, str, str]:
    now = datetime.now(tz=UTC)
    range_map = {
        "1h": (timedelta(hours=1), "15s"),
        "6h": (timedelta(hours=6), "60s"),
        "24h": (timedelta(hours=24), "120s"),
        "7d": (timedelta(days=7), "600s"),
        "30d": (timedelta(days=30), "3600s"),
    }
    delta, step = range_map.get(range_str, (timedelta(hours=1), "15s"))
    return (now - delta).isoformat(), now.isoformat(), step


@router.get("/namespaces/{ns}/vms/{vm_name}/metrics")
def get_vm_metrics(
    cluster: str,
    ns: str,
    vm_name: str,
    range: str = Query("1h", description="Time range: 1h, 6h, 24h, 7d"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    start, end, step = _parse_range(range)
    try:
        return svc.get_vm_metrics(ns, vm_name, start, end, step)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Prometheus query failed: {str(e)[:200]}")


@router.get("/namespaces/{ns}/vms/{vm_name}/timeline")
def get_vm_timeline(
    cluster: str,
    ns: str,
    vm_name: str,
    range: str = Query("1h"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    svc = MetricsService(api_client)
    start, end, step = _parse_range(range)

    # Get metrics
    metrics = svc.get_vm_timeline(ns, vm_name, start, end, step)

    # Get events
    kv = KubeVirtClient(api_client)
    all_events = kv.list_events(ns)
    vm_events = [
        e
        for e in all_events
        if e.get("involved_object_name", "") == vm_name
        or e.get("involved_object_name", "").startswith(f"{vm_name}-")
    ]
    # Filter events to time range
    vm_events = [e for e in vm_events if e.get("timestamp", "") >= start]

    # Detect state changes from event reasons
    state_change_reasons = {
        "Started",
        "Stopped",
        "SuccessfulCreate",
        "SuccessfulDelete",
        "Migrating",
        "Migrated",
        "FailedMigration",
    }
    state_changes = [
        {
            "timestamp": e["timestamp"],
            "state": e["reason"],
            "type": e.get("type", "Normal"),
        }
        for e in vm_events
        if e.get("reason") in state_change_reasons
    ]

    return {
        **metrics,
        "events": vm_events,
        "state_changes": state_changes,
    }


@router.get("/metrics/overview")
def get_cluster_metrics(
    cluster: str,
    range: str = Query("24h"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    start, end, step = _parse_range(range)
    try:
        return svc.get_cluster_metrics(start, end, step)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Prometheus query failed: {str(e)[:200]}")


@router.get("/nodes/{node_name}/metrics")
def get_node_metrics(
    cluster: str,
    node_name: str,
    range: str = Query("1h"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    start, end, step = _parse_range(range)
    try:
        return svc.get_node_metrics(node_name, start, end, step)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Prometheus query failed: {str(e)[:200]}")
