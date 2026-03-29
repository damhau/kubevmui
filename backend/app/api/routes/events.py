from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["events"],
)


def _filter_by_time(events: list[dict], since: str | None, until: str | None) -> list[dict]:
    if not since and not until:
        return events
    filtered = events
    if since:
        filtered = [e for e in filtered if e.get("timestamp", "") >= since]
    if until:
        filtered = [e for e in filtered if e.get("timestamp", "") <= until]
    return filtered


@router.get("/namespaces/{ns}/events")
def list_namespace_events(
    cluster: str,
    ns: str,
    since: str | None = Query(None, description="ISO timestamp filter (events after)"),
    until: str | None = Query(None, description="ISO timestamp filter (events before)"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    kv = KubeVirtClient(api_client)
    items = kv.list_events(ns)
    items = _filter_by_time(items, since, until)
    return {"items": items, "total": len(items)}


@router.get("/events")
def list_all_events(
    cluster: str,
    since: str | None = Query(None, description="ISO timestamp filter (events after)"),
    until: str | None = Query(None, description="ISO timestamp filter (events before)"),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    kv = KubeVirtClient(api_client)
    items = kv.list_all_events()
    items = _filter_by_time(items, since, until)
    return {"items": items, "total": len(items)}
