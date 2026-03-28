from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
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
