from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.services.analytics_service import AnalyticsService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["analytics"],
)


def _get_service(cluster: str, cm: ClusterManager) -> AnalyticsService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return AnalyticsService(api_client)


def _parse_range(range_str: str) -> tuple[str, str, str]:
    now = datetime.now(tz=UTC)
    range_map = {
        "1h": (timedelta(hours=1), "15s"),
        "6h": (timedelta(hours=6), "60s"),
        "24h": (timedelta(hours=24), "120s"),
        "7d": (timedelta(days=7), "600s"),
        "30d": (timedelta(days=30), "3600s"),
    }
    delta, step = range_map.get(range_str, (timedelta(hours=24), "120s"))
    return (now - delta).isoformat(), now.isoformat(), step


@router.get("/analytics/top-consumers")
def get_top_consumers(
    cluster: str,
    metric: str = Query("cpu", description="cpu, memory, or network"),
    limit: int = Query(10, ge=1, le=50),
    range: str = Query("24h"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    start, end, step = _parse_range(range)
    return {"items": svc.get_top_consumers(metric, limit, start, end, step)}


@router.get("/analytics/trends")
def get_trends(
    cluster: str,
    range: str = Query("7d"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    start, end, step = _parse_range(range)
    return svc.get_trends(start, end, step)


@router.get("/analytics/migrations")
def get_migration_stats(
    cluster: str,
    range: str = Query("7d"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    range_days = {"1h": 1, "6h": 1, "24h": 1, "7d": 7, "30d": 30}.get(range, 7)
    return svc.get_migration_stats(range_days)
