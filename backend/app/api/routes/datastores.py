from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.models.datastore import Datastore, DatastoreList, PersistentVolumeList
from app.services.datastore_service import DatastoreService
from app.services.metrics_service import MetricsService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["datastores"],
)


def _get_service(cluster: str, cm: ClusterManager) -> DatastoreService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return DatastoreService(api_client)


def _get_metrics_service(cluster: str, cm: ClusterManager) -> MetricsService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return MetricsService(api_client)


def _enrich_capacity_from_metrics(items: list[Datastore], metrics_svc: MetricsService) -> None:
    """Override total/available capacity with live Prometheus data when possible."""
    for ds in items:
        try:
            total, available = metrics_svc.get_datastore_capacity_from_metrics(
                ds.provider_type, ds.parameters
            )
            if total is not None:
                ds.total_capacity_gb = total
            if available is not None:
                ds.available_capacity_gb = available
        except Exception:
            pass


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


@router.get("/datastores", response_model=DatastoreList)
def list_datastores(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_datastores()
    # Enrich with live Prometheus capacity data
    try:
        metrics_svc = _get_metrics_service(cluster, cm)
        _enrich_capacity_from_metrics(items, metrics_svc)
    except Exception:
        pass  # Prometheus may be unavailable
    return DatastoreList(items=items, total=len(items))


@router.get("/datastores/{name}", response_model=Datastore)
def get_datastore(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    ds = svc.get_datastore(name)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Datastore '{name}' not found")
    # Enrich with live Prometheus capacity
    try:
        metrics_svc = _get_metrics_service(cluster, cm)
        total, available = metrics_svc.get_datastore_capacity_from_metrics(
            ds.provider_type, ds.parameters
        )
        if total is not None:
            ds.total_capacity_gb = total
        if available is not None:
            ds.available_capacity_gb = available
    except Exception:
        pass
    return ds


@router.get("/datastores/{name}/pvs", response_model=PersistentVolumeList)
def list_datastore_pvs(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_pvs_for_class(name)
    return PersistentVolumeList(items=items, total=len(items))


@router.get("/datastores/{name}/metrics")
def get_datastore_metrics(
    cluster: str,
    name: str,
    range: str = Query("1h", description="Time range: 1h, 6h, 24h, 7d, 30d"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    ds_svc = _get_service(cluster, cm)
    ds = ds_svc.get_datastore(name)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Datastore '{name}' not found")
    metrics_svc = _get_metrics_service(cluster, cm)
    start, end, step = _parse_range(range)
    try:
        return metrics_svc.get_datastore_metrics(ds.provider_type, ds.parameters, start, end, step)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Prometheus query failed: {str(e)[:200]}"
        ) from e
