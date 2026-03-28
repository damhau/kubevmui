from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo
from app.models.template import Template, TemplateCreate, TemplateList
from app.services.template_service import TemplateService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}/namespaces/{ns}",
    tags=["templates"],
)


def _get_service(cluster: str, cm: ClusterManager) -> TemplateService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return TemplateService(api_client)


@router.get("/templates", response_model=TemplateList)
def list_templates(
    cluster: str,
    ns: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_templates(ns)
    return TemplateList(items=items, total=len(items))


@router.get("/templates/{name}", response_model=Template)
def get_template(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    tpl = svc.get_template(ns, name)
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    return tpl


@router.post("/templates", response_model=Template, status_code=201)
def create_template(
    cluster: str,
    ns: str,
    body: TemplateCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    if not body.namespace:
        body.namespace = ns
    return svc.create_template(body)


@router.delete("/templates/{name}", status_code=204)
def delete_template(
    cluster: str,
    ns: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_template(ns, name)
