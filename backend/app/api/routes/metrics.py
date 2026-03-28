from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.models.auth import UserInfo
from app.services.metrics_service import MetricsService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["metrics"],
)


@router.get("/namespaces/{ns}/vms/{vm_name}/metrics")
async def get_vm_metrics(
    cluster: str,
    ns: str,
    vm_name: str,
    range: str = Query("1h", description="Time range: 1h, 6h, 24h, 7d"),
    _user: UserInfo = Depends(get_current_user),
):
    svc = MetricsService()

    now = datetime.now(tz=UTC)
    range_map = {
        "1h": (timedelta(hours=1), "15s"),
        "6h": (timedelta(hours=6), "60s"),
        "24h": (timedelta(hours=24), "120s"),
        "7d": (timedelta(days=7), "600s"),
        "30d": (timedelta(days=30), "3600s"),
    }
    delta, step = range_map.get(range, (timedelta(hours=1), "15s"))
    start = (now - delta).isoformat()
    end = now.isoformat()

    try:
        return await svc.get_vm_metrics(ns, vm_name, start, end, step)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Prometheus query failed: {str(e)[:200]}")


@router.get("/metrics/overview")
async def get_cluster_metrics(
    cluster: str,
    range: str = Query("24h"),
    _user: UserInfo = Depends(get_current_user),
):
    svc = MetricsService()

    now = datetime.now(tz=UTC)
    range_map = {
        "1h": (timedelta(hours=1), "60s"),
        "6h": (timedelta(hours=6), "120s"),
        "24h": (timedelta(hours=24), "300s"),
        "7d": (timedelta(days=7), "1800s"),
    }
    delta, step = range_map.get(range, (timedelta(hours=24), "300s"))
    start = (now - delta).isoformat()
    end = now.isoformat()

    try:
        return await svc.get_cluster_metrics(start, end, step)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Prometheus query failed: {str(e)[:200]}")
