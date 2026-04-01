from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.models.datastore import Datastore, DatastoreList
from app.services.datastore_service import DatastoreService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["datastores"],
)


def _get_service(cluster: str, cm: ClusterManager) -> DatastoreService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return DatastoreService(api_client)


@router.get("/datastores", response_model=DatastoreList)
def list_datastores(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_datastores()
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
    return ds
