"""REST endpoints for VM import / MigrationPlan management."""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import get_cluster_manager, get_current_user
from app.audit.service import AuditService
from app.core.cluster_manager import ClusterManager
from app.core.config import settings
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.import_vm import (
    MigrationPlan,
    MigrationPlanCreate,
    MigrationPlanList,
    OVAUploadResponse,
    SourceType,
    ValidationResult,
)
from app.services.import_service import ImportService
from app.services.ova_parser import OVAParseError, parse_ova

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["import"],
)

_audit = AuditService()


def _get_service(cluster: str, cm: ClusterManager, user: UserInfo) -> ImportService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return ImportService(
        KubeVirtClient(api_client),
        audit=_audit,
        username=user.username,
    )


# ── Upload OVA ────────────────────────────────────────────────────────


@router.post("/import/upload-ova", response_model=OVAUploadResponse, status_code=201)
async def upload_ova(
    cluster: str,
    file: UploadFile = File(...),
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")

    size_limit = settings.kubevmui_import_max_ova_size_gb * 1024 * 1024 * 1024
    if file.size and file.size > size_limit:
        raise HTTPException(
            status_code=413,
            detail=(
                f"OVA exceeds configured limit "
                f"({settings.kubevmui_import_max_ova_size_gb} GiB). "
                "Raise KUBEVMUI_IMPORT_MAX_OVA_SIZE_GB or split the upload."
            ),
        )

    upload_id = uuid.uuid4().hex
    staging_dir = Path(settings.kubevmui_import_staging_dir) / upload_id
    staging_dir.mkdir(parents=True, exist_ok=True)
    dest = staging_dir / (file.filename or "upload.ova")

    try:
        with dest.open("wb") as f:
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as exc:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to stage OVA: {exc}") from exc

    try:
        meta = parse_ova(dest)
    except OVAParseError as exc:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Invalid OVA: {exc}") from exc

    ImportService.register_upload(upload_id, dest, meta)

    return OVAUploadResponse(
        upload_id=upload_id,
        size_mb=int(dest.stat().st_size / (1024 * 1024)),
        vm_name=meta.vm_name,
        disk_count=len(meta.disks),
    )


# ── Validate ──────────────────────────────────────────────────────────


@router.post("/import/validate", response_model=ValidationResult)
def validate_plan(
    cluster: str,
    body: MigrationPlanCreate,
    user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm, user)
    errors: list[str] = []
    warnings: list[str] = []

    # Target namespace must exist
    namespaces = svc.kv.list_namespaces()
    if body.target_namespace not in namespaces:
        errors.append(f"Target namespace '{body.target_namespace}' does not exist")

    # Target VM name uniqueness
    existing = {
        vm.get("metadata", {}).get("name", "") for vm in svc.kv.list_vms(body.target_namespace)
    }
    for vm in body.vms:
        name = vm.target_name or vm.source_name
        if name in existing:
            errors.append(f"VM '{name}' already exists in namespace '{body.target_namespace}'")

    # OVA upload id must be registered
    if body.source.type == SourceType.OVA:
        if not body.source.ova_upload_id:
            errors.append("source.ovaUploadId is required for source.type=ova")
        elif ImportService.get_upload(body.source.ova_upload_id) is None:
            errors.append(
                f"OVA upload '{body.source.ova_upload_id}' not found "
                "(upload may have expired with the backend process)"
            )
    else:
        warnings.append(
            f"Source type '{body.source.type.value}' is recognised but not yet implemented "
            "(foundation #42 covers OVA only; see #43/#44)"
        )

    return ValidationResult(ok=not errors, errors=errors, warnings=warnings)


# ── MigrationPlan CRUD ────────────────────────────────────────────────


@router.get("/migration-plans", response_model=MigrationPlanList)
def list_plans(
    cluster: str,
    user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm, user)
    items = svc.list_plans()
    return MigrationPlanList(items=items, total=len(items))


@router.get("/migration-plans/{name}", response_model=MigrationPlan)
def get_plan(
    cluster: str,
    name: str,
    user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm, user)
    plan = svc.get_plan(name)
    if plan is None:
        raise HTTPException(status_code=404, detail=f"MigrationPlan '{name}' not found")
    return plan


@router.post("/migration-plans", response_model=MigrationPlan, status_code=201)
def create_plan(
    cluster: str,
    body: MigrationPlanCreate,
    user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm, user)
    if body.source.type != SourceType.OVA:
        raise HTTPException(
            status_code=501,
            detail=(
                f"Source type '{body.source.type.value}' is not implemented yet. "
                "Foundation (#42) supports OVA only; Hyper-V is tracked in #43 "
                "and vCenter/ESXi in #44."
            ),
        )
    plan = svc.create_plan(body)
    svc.start_plan(plan.name)
    return plan


@router.delete("/migration-plans/{name}", status_code=204)
def delete_plan(
    cluster: str,
    name: str,
    user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm, user)
    svc.delete_plan(name)


@router.post("/migration-plans/{name}/retry", response_model=MigrationPlan)
def retry_plan(
    cluster: str,
    name: str,
    user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    """Re-run failed VMs in a plan.

    Foundation stub: restarts the whole plan. Granular per-VM retry is #46.
    """
    svc = _get_service(cluster, cm, user)
    plan = svc.get_plan(name)
    if plan is None:
        raise HTTPException(status_code=404, detail=f"MigrationPlan '{name}' not found")
    svc.start_plan(name)
    return plan
