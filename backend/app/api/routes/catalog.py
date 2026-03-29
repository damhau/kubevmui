from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.catalog import (
    CatalogEntry,
    CatalogEntryList,
    CatalogStatus,
    ProvisionRequest,
    ProvisionResponse,
)
from app.services.catalog_service import CatalogService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/catalog",
    tags=["catalog"],
)


def _get_service(cluster: str, cm: ClusterManager) -> CatalogService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return CatalogService(KubeVirtClient(api_client))


@router.get("", response_model=CatalogEntryList)
def list_catalog_entries(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_entries()
    return CatalogEntryList(items=items, total=len(items))


@router.get("/{name}", response_model=CatalogEntry)
def get_catalog_entry(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    entry = svc.get_entry(name)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Catalog entry '{name}' not found")
    return entry


@router.post("/{name}/provision", response_model=ProvisionResponse, status_code=201)
def provision_catalog_entry(
    cluster: str,
    name: str,
    body: ProvisionRequest,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    try:
        return svc.provision(name, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/status", response_model=CatalogStatus)
def get_catalog_status(
    cluster: str,
    name: str,
    namespace: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.get_status(name, namespace)
