"""Migration orchestration for VM imports.

Foundation (#42) supports ``source.type=ova`` end-to-end. Other source types
(``hyperv``, ``vcenter``, ``esxi``) are recognised in the CRD schema but return
``NotImplementedError`` from ``run_plan`` until #43 and #44 land.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from kubernetes.client import ApiException

from app.audit.service import AuditService
from app.core.config import settings
from app.core.k8s_client import KubeVirtClient
from app.models.import_vm import (
    DiskImportStatus,
    MigrationPlan,
    MigrationPlanCreate,
    MigrationPlanStatus,
    NetworkMapping,
    PlanPhase,
    SourceConfig,
    SourceType,
    StorageMapping,
    VMImport,
    VMImportStatus,
    VMPhase,
)
from app.services import cdi_upload
from app.services.disk_converter import convert_to_qcow2
from app.services.ova_parser import OVAMetadata, extract_disk, parse_ova

logger = logging.getLogger(__name__)

LABEL_MANAGED_BY = "app.kubernetes.io/managed-by"
LABEL_PLAN = "kubevmui.io/migration-plan"


class MigrationError(RuntimeError):
    """Fatal error that aborts a single VM's import pipeline."""


def _plan_from_raw(raw: dict) -> MigrationPlan:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    status_dict = raw.get("status", {}) or {}
    source_dict = spec.get("source", {}) or {}

    source = SourceConfig(
        type=SourceType(source_dict.get("type", "ova")),
        endpoint=source_dict.get("endpoint", ""),
        credentials_ref=source_dict.get("credentialsRef", ""),
        ova_upload_id=source_dict.get("ovaUploadId", ""),
        insecure_skip_verify=bool(source_dict.get("insecureSkipVerify", False)),
        winrm_port=source_dict.get("winrmPort"),
        winrm_transport=source_dict.get("winrmTransport", ""),
    )

    vms = [
        VMImport(
            source_vm_id=v.get("sourceVMId", ""),
            source_name=v.get("sourceName", ""),
            target_name=v.get("targetName", "") or v.get("sourceName", ""),
            cpu_cores=v.get("cpuCores"),
            memory_mb=v.get("memoryMb"),
            firmware=v.get("firmware", ""),
            start_after_migration=bool(v.get("startAfterMigration", False)),
            install_guest_agent=bool(v.get("installGuestAgent", True)),
            capture_as_image=bool(v.get("captureAsImage", False)),
        )
        for v in spec.get("vms", [])
    ]

    status = _status_from_raw(status_dict)

    created_at: datetime | None = None
    ts = metadata.get("creationTimestamp")
    if ts:
        with contextlib.suppress(ValueError, TypeError):
            created_at = (
                datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                if isinstance(ts, str)
                else ts
            )

    return MigrationPlan(
        name=metadata.get("name", ""),
        display_name=spec.get("displayName", metadata.get("name", "")),
        description=spec.get("description", ""),
        source=source,
        target_namespace=spec.get("targetNamespace", ""),
        network_mappings=[NetworkMapping(**m) for m in spec.get("networkMappings", [])],
        storage_mappings=[StorageMapping(**m) for m in spec.get("storageMappings", [])],
        vms=vms,
        status=status,
        created_at=created_at,
        raw_manifest=raw,
    )


def _status_from_raw(status_dict: dict) -> MigrationPlanStatus:
    def _parse_dt(val: Any) -> datetime | None:
        if not val:
            return None
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None

    vm_statuses = []
    for vs in status_dict.get("vmStatuses", []) or []:
        vm_statuses.append(
            VMImportStatus(
                name=vs.get("name", ""),
                phase=VMPhase(vs.get("phase", VMPhase.PENDING.value)),
                progress=int(vs.get("progress", 0) or 0),
                error=vs.get("error", "") or "",
                start_time=_parse_dt(vs.get("startTime")),
                completion_time=_parse_dt(vs.get("completionTime")),
                disk_statuses=[
                    DiskImportStatus(
                        name=ds.get("name", ""),
                        size_mb=int(ds.get("sizeMb", 0) or 0),
                        phase=ds.get("phase", ""),
                        progress=int(ds.get("progress", 0) or 0),
                    )
                    for ds in (vs.get("diskStatuses") or [])
                ],
            )
        )

    return MigrationPlanStatus(
        phase=PlanPhase(status_dict.get("phase", PlanPhase.PENDING.value)),
        start_time=_parse_dt(status_dict.get("startTime")),
        completion_time=_parse_dt(status_dict.get("completionTime")),
        message=status_dict.get("message", "") or "",
        vm_statuses=vm_statuses,
    )


def _status_to_dict(status: MigrationPlanStatus) -> dict:
    def _dt(d: datetime | None) -> str | None:
        return d.isoformat() if d else None

    return {
        "phase": status.phase.value,
        "startTime": _dt(status.start_time),
        "completionTime": _dt(status.completion_time),
        "message": status.message,
        "vmStatuses": [
            {
                "name": vs.name,
                "phase": vs.phase.value,
                "progress": vs.progress,
                "error": vs.error,
                "startTime": _dt(vs.start_time),
                "completionTime": _dt(vs.completion_time),
                "diskStatuses": [
                    {
                        "name": ds.name,
                        "sizeMb": ds.size_mb,
                        "phase": ds.phase,
                        "progress": ds.progress,
                    }
                    for ds in vs.disk_statuses
                ],
            }
            for vs in status.vm_statuses
        ],
    }


class ImportService:
    """Orchestrates VM migration plans.

    A single instance is created per-request (mirrors other services), but the
    running asyncio tasks and OVA uploads are held on class-level registries so
    they survive across requests within the same backend process.
    """

    _tasks: dict[str, asyncio.Task] = {}
    _task_locks: dict[str, asyncio.Lock] = {}
    _uploads: dict[str, dict] = {}  # upload_id → {"path": Path, "vm_name", "disk_count", "size_mb"}
    _concurrency_sem: asyncio.Semaphore | None = None

    def __init__(
        self,
        kv: KubeVirtClient,
        audit: AuditService | None = None,
        username: str = "system",
    ):
        self.kv = kv
        self.audit = audit
        self.username = username
        if ImportService._concurrency_sem is None:
            ImportService._concurrency_sem = asyncio.Semaphore(
                max(1, settings.kubevmui_import_max_concurrent)
            )

    # ── CRUD ──────────────────────────────────────────────────────

    def list_plans(self) -> list[MigrationPlan]:
        return [_plan_from_raw(raw) for raw in self.kv.list_migration_plans()]

    def get_plan(self, name: str) -> MigrationPlan | None:
        raw = self.kv.get_migration_plan(name)
        return _plan_from_raw(raw) if raw else None

    def create_plan(self, request: MigrationPlanCreate) -> MigrationPlan:
        body = _build_plan_manifest(request)
        raw = self.kv.create_migration_plan(body)
        plan = _plan_from_raw(raw)

        # Initialize status with a PendingPhase + empty VM statuses.
        initial_status = MigrationPlanStatus(
            phase=PlanPhase.PENDING,
            vm_statuses=[
                VMImportStatus(name=vm.target_name or vm.source_name) for vm in request.vms
            ],
        )
        try:
            self.kv.patch_migration_plan_status(plan.name, _status_to_dict(initial_status))
        except ApiException as exc:
            logger.warning("Failed to initialize status for MigrationPlan %s: %s", plan.name, exc)
        plan.status = initial_status

        if self.audit:
            self.audit.record(
                username=self.username,
                action="create_migrationplan",
                resource_type="MigrationPlan",
                resource_name=plan.name,
                namespace=plan.target_namespace,
                details=f"source={request.source.type.value}, vms={len(request.vms)}",
            )

        return plan

    def delete_plan(self, name: str) -> None:
        # Cancel any in-flight task
        task = ImportService._tasks.pop(name, None)
        if task and not task.done():
            task.cancel()

        try:
            self.kv.delete_migration_plan(name)
        except ApiException as exc:
            if exc.status != 404:
                raise

        if self.audit:
            self.audit.record(
                username=self.username,
                action="delete_migrationplan",
                resource_type="MigrationPlan",
                resource_name=name,
                namespace="",
                details="",
            )

    # ── OVA upload staging ────────────────────────────────────────

    @classmethod
    def register_upload(cls, upload_id: str, staged_path: Path, meta: OVAMetadata | None) -> None:
        cls._uploads[upload_id] = {
            "path": staged_path,
            "vm_name": meta.vm_name if meta else "",
            "disk_count": len(meta.disks) if meta else 0,
            "size_mb": int(staged_path.stat().st_size / (1024 * 1024)),
            "meta": meta,
        }

    @classmethod
    def get_upload(cls, upload_id: str) -> dict | None:
        return cls._uploads.get(upload_id)

    @classmethod
    def drop_upload(cls, upload_id: str) -> None:
        entry = cls._uploads.pop(upload_id, None)
        if entry:
            try:
                path: Path = entry["path"]
                if path.exists():
                    shutil.rmtree(path.parent, ignore_errors=True)
            except OSError:
                logger.exception("Failed to clean up upload staging for %s", upload_id)

    # ── Orchestration ─────────────────────────────────────────────

    def start_plan(self, name: str) -> None:
        """Fire-and-forget launch of the import pipeline for ``name``."""

        if name in ImportService._tasks and not ImportService._tasks[name].done():
            logger.info("Plan %s is already running, not re-starting", name)
            return

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.error("start_plan called outside a running event loop; plan %s", name)
            return

        task = loop.create_task(self._run_plan_safe(name))
        ImportService._tasks[name] = task

    async def resume_pending_plans(self) -> int:
        """Scan plans and resume any that are in Pending or InProgress."""

        count = 0
        try:
            plans = self.list_plans()
        except ApiException as exc:
            logger.warning("Failed to list migration plans on resume: %s", exc)
            return 0

        for plan in plans:
            if plan.status.phase in (PlanPhase.PENDING, PlanPhase.IN_PROGRESS):
                logger.info("Resuming migration plan %s (phase=%s)", plan.name, plan.status.phase)
                self.start_plan(plan.name)
                count += 1
        return count

    async def _run_plan_safe(self, name: str) -> None:
        try:
            await self.run_plan(name)
        except asyncio.CancelledError:
            logger.info("Plan %s cancelled", name)
            await self._set_plan_phase(name, PlanPhase.FAILED, message="cancelled")
        except Exception as exc:
            logger.exception("Plan %s failed with unhandled exception", name)
            await self._set_plan_phase(name, PlanPhase.FAILED, message=f"internal error: {exc}")

    async def run_plan(self, name: str) -> None:
        """Execute the full pipeline for a plan."""

        plan = self.get_plan(name)
        if plan is None:
            logger.warning("run_plan: plan %s not found", name)
            return

        assert ImportService._concurrency_sem is not None
        async with ImportService._concurrency_sem:
            await self._run_plan_inner(plan)

    async def _run_plan_inner(self, plan: MigrationPlan) -> None:
        if plan.source.type != SourceType.OVA:
            raise NotImplementedError(
                f"Source type '{plan.source.type.value}' is not implemented "
                f"(foundation #42 supports 'ova' only; see #43/#44)"
            )

        status = plan.status
        if not status.vm_statuses:
            status.vm_statuses = [
                VMImportStatus(name=v.target_name or v.source_name) for v in plan.vms
            ]
        status.phase = PlanPhase.IN_PROGRESS
        status.start_time = status.start_time or datetime.now(tz=UTC)
        status.message = ""
        await self._patch_status(plan.name, status)

        upload = ImportService.get_upload(plan.source.ova_upload_id)
        if upload is None:
            raise MigrationError(
                f"OVA upload id '{plan.source.ova_upload_id}' not found "
                "(was it uploaded in this backend session?)"
            )
        ova_path: Path = upload["path"]
        ova_meta: OVAMetadata | None = upload.get("meta")
        if ova_meta is None:
            ova_meta = parse_ova(ova_path)

        for idx, vm in enumerate(plan.vms):
            vm_status = status.vm_statuses[idx]
            vm_status.start_time = datetime.now(tz=UTC)
            try:
                await self._import_vm(plan, vm, idx, ova_path, ova_meta, status)
                vm_status.phase = VMPhase.COMPLETED
                vm_status.progress = 100
                vm_status.completion_time = datetime.now(tz=UTC)
                if self.audit:
                    self.audit.record(
                        username=self.username,
                        action="migrationplan_vm_completed",
                        resource_type="MigrationPlan",
                        resource_name=plan.name,
                        namespace=plan.target_namespace,
                        details=f"vm={vm.target_name or vm.source_name}",
                    )
            except asyncio.CancelledError:
                vm_status.phase = VMPhase.FAILED
                vm_status.error = "cancelled"
                vm_status.completion_time = datetime.now(tz=UTC)
                await self._patch_status(plan.name, status)
                raise
            except Exception as exc:
                logger.exception("VM import failed: plan=%s vm=%s", plan.name, vm.target_name)
                vm_status.phase = VMPhase.FAILED
                vm_status.error = str(exc)[:500]
                vm_status.completion_time = datetime.now(tz=UTC)
                if self.audit:
                    self.audit.record(
                        username=self.username,
                        action="migrationplan_vm_failed",
                        resource_type="MigrationPlan",
                        resource_name=plan.name,
                        namespace=plan.target_namespace,
                        details=f"vm={vm.target_name or vm.source_name}: {str(exc)[:200]}",
                    )

            await self._patch_status(plan.name, status)

        # Determine final plan phase
        succeeded = sum(1 for vs in status.vm_statuses if vs.phase == VMPhase.COMPLETED)
        failed = sum(1 for vs in status.vm_statuses if vs.phase == VMPhase.FAILED)
        if failed == 0:
            status.phase = PlanPhase.COMPLETED
        elif succeeded == 0:
            status.phase = PlanPhase.FAILED
        else:
            status.phase = PlanPhase.PARTIALLY_COMPLETED
        status.completion_time = datetime.now(tz=UTC)
        await self._patch_status(plan.name, status)

    async def _import_vm(
        self,
        plan: MigrationPlan,
        vm: VMImport,
        idx: int,
        ova_path: Path,
        ova_meta: OVAMetadata,
        status: MigrationPlanStatus,
    ) -> None:
        """Export → convert → CDI upload → create VM. Status written in place."""

        vm_status = status.vm_statuses[idx]
        target_name = _sanitize_vm_name(vm.target_name or vm.source_name)
        staging_root = Path(settings.kubevmui_import_staging_dir)
        workdir = staging_root / plan.name / target_name
        workdir.mkdir(parents=True, exist_ok=True)

        if not ova_meta.disks:
            raise MigrationError("OVA has no disks")

        # Seed per-disk status rows
        vm_status.disk_statuses = [
            DiskImportStatus(
                name=d.href,
                size_mb=int(d.capacity_bytes / (1024 * 1024)) if d.capacity_bytes else 0,
                phase="Pending",
                progress=0,
            )
            for d in ova_meta.disks
        ]

        # For foundation we handle the first disk only. Multi-disk is a
        # straightforward extension but adds VM manifest complexity that is
        # better landed once the first round-trip is verified.
        disk = ova_meta.disks[0]
        disk_status = vm_status.disk_statuses[0]

        # 1. Export: extract VMDK from the OVA tar
        vm_status.phase = VMPhase.EXPORTING_DISK
        disk_status.phase = "Exporting"
        await self._patch_status(plan.name, status)

        raw_disk = extract_disk(ova_path, disk.href, workdir)
        logger.info(
            "Extracted disk %s → %s (%d bytes)", disk.href, raw_disk, raw_disk.stat().st_size
        )

        # 2. Convert: qemu-img to qcow2
        vm_status.phase = VMPhase.CONVERTING_DISK
        disk_status.phase = "Converting"
        disk_status.progress = 0
        await self._patch_status(plan.name, status)

        qcow2_path = workdir / f"{target_name}.qcow2"

        last_patch = 0.0
        throttle_s = 1.0

        async def _progress(pct: int) -> None:
            nonlocal last_patch
            disk_status.progress = pct
            vm_status.progress = pct // 3  # rough overall estimate
            now = asyncio.get_running_loop().time()
            if now - last_patch >= throttle_s:
                last_patch = now
                await self._patch_status(plan.name, status)

        await convert_to_qcow2(raw_disk, qcow2_path, disk.format, progress_cb=_progress)
        disk_status.progress = 100
        raw_disk.unlink(missing_ok=True)
        await self._patch_status(plan.name, status)

        # 3. Import: CDI upload to a new DataVolume in the target namespace
        vm_status.phase = VMPhase.IMPORTING_DISK
        disk_status.phase = "Importing"
        disk_status.progress = 0
        await self._patch_status(plan.name, status)

        dv_name = f"{target_name}-disk0"
        storage_class = _pick_storage_class(plan, ova_meta)
        dv_size_gb = _pvc_size_gb(disk, qcow2_path)

        dv_manifest = {
            "apiVersion": "cdi.kubevirt.io/v1beta1",
            "kind": "DataVolume",
            "metadata": {
                "name": dv_name,
                "namespace": plan.target_namespace,
                "labels": {
                    LABEL_MANAGED_BY: "kubevmui",
                    LABEL_PLAN: plan.name,
                    "kubevmui.io/type": "migration-import",
                },
            },
            "spec": {
                "source": {"upload": {}},
                "pvc": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {"requests": {"storage": f"{dv_size_gb}Gi"}},
                    **({"storageClassName": storage_class} if storage_class else {}),
                },
            },
        }
        try:
            self.kv.create_datavolume(plan.target_namespace, dv_manifest)
        except ApiException as exc:
            if exc.status != 409:  # already exists → treat as resume
                raise

        # Run the blocking upload in a thread so we don't starve the event loop
        await asyncio.to_thread(
            cdi_upload.upload_file,
            self.kv,
            plan.target_namespace,
            dv_name,
            qcow2_path,
        )

        await asyncio.to_thread(
            cdi_upload.wait_for_dv_bound,
            self.kv,
            plan.target_namespace,
            dv_name,
        )
        disk_status.progress = 100
        qcow2_path.unlink(missing_ok=True)
        await self._patch_status(plan.name, status)

        # 4. Create VirtualMachine manifest + apply
        vm_status.phase = VMPhase.CREATING_VM
        vm_status.progress = 90
        await self._patch_status(plan.name, status)

        vm_manifest = _build_vm_manifest(plan, vm, target_name, dv_name, ova_meta)
        try:
            self.kv.create_vm(plan.target_namespace, vm_manifest)
        except ApiException as exc:
            if exc.status != 409:
                raise

        # 5. Optional: start the VM
        if vm.start_after_migration:
            try:
                self.kv.vm_action(plan.target_namespace, target_name, "start")
            except ApiException as exc:
                logger.warning("VM %s created but start failed: %s", target_name, exc)

        # 6. Optional: capture as Image CR
        if vm.capture_as_image:
            self._capture_as_image(plan, vm, target_name, dv_name, dv_size_gb, storage_class)

        # Clean up empty workdir
        shutil.rmtree(workdir, ignore_errors=True)

    def _capture_as_image(
        self,
        plan: MigrationPlan,
        vm: VMImport,
        target_name: str,
        dv_name: str,
        size_gb: int,
        storage_class: str,
    ) -> None:
        """Create an Image CR pointing at the just-imported PVC."""

        image_name = f"{target_name}-imported"
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Image",
            "metadata": {
                "name": image_name,
                "labels": {
                    LABEL_MANAGED_BY: "kubevmui",
                    LABEL_PLAN: plan.name,
                },
            },
            "spec": {
                "displayName": f"{target_name} (from {plan.display_name})",
                "description": f"Captured from migration plan {plan.name}",
                "osType": "linux",
                "mediaType": "disk",
                "source": {"type": "pvc", "url": f"{plan.target_namespace}/{dv_name}"},
                "storage": {
                    "namespace": plan.target_namespace,
                    "sizeGb": size_gb,
                    "storageClass": storage_class,
                },
            },
        }
        try:
            self.kv.create_image(body)
            logger.info(
                "Captured migration %s/%s as Image '%s'", plan.name, target_name, image_name
            )
        except ApiException as exc:
            if exc.status != 409:
                logger.warning("captureAsImage failed for %s: %s", target_name, exc)

    # ── Status writer ─────────────────────────────────────────────

    async def _patch_status(self, name: str, status: MigrationPlanStatus) -> None:
        try:
            await asyncio.to_thread(
                self.kv.patch_migration_plan_status, name, _status_to_dict(status)
            )
        except ApiException as exc:
            logger.warning("Failed to patch status for MigrationPlan %s: %s", name, exc)

    async def _set_plan_phase(self, name: str, phase: PlanPhase, message: str = "") -> None:
        plan = self.get_plan(name)
        if plan is None:
            return
        plan.status.phase = phase
        if message:
            plan.status.message = message
        if phase in (PlanPhase.COMPLETED, PlanPhase.FAILED, PlanPhase.PARTIALLY_COMPLETED):
            plan.status.completion_time = datetime.now(tz=UTC)
        await self._patch_status(name, plan.status)


# ── Helpers ──────────────────────────────────────────────────────────


def _build_plan_manifest(request: MigrationPlanCreate) -> dict:
    source = request.source
    source_spec: dict[str, Any] = {"type": source.type.value}
    if source.endpoint:
        source_spec["endpoint"] = source.endpoint
    if source.credentials_ref:
        source_spec["credentialsRef"] = source.credentials_ref
    if source.ova_upload_id:
        source_spec["ovaUploadId"] = source.ova_upload_id
    if source.insecure_skip_verify:
        source_spec["insecureSkipVerify"] = True
    if source.winrm_port is not None:
        source_spec["winrmPort"] = source.winrm_port
    if source.winrm_transport:
        source_spec["winrmTransport"] = source.winrm_transport

    vms = []
    for v in request.vms:
        vm_spec: dict[str, Any] = {
            "sourceVMId": v.source_vm_id,
            "sourceName": v.source_name,
            "installGuestAgent": v.install_guest_agent,
            "startAfterMigration": v.start_after_migration,
            "captureAsImage": v.capture_as_image,
        }
        if v.target_name:
            vm_spec["targetName"] = v.target_name
        if v.cpu_cores is not None:
            vm_spec["cpuCores"] = v.cpu_cores
        if v.memory_mb is not None:
            vm_spec["memoryMb"] = v.memory_mb
        if v.firmware:
            vm_spec["firmware"] = v.firmware
        vms.append(vm_spec)

    return {
        "apiVersion": "kubevmui.io/v1",
        "kind": "MigrationPlan",
        "metadata": {
            "name": request.name,
            "labels": {LABEL_MANAGED_BY: "kubevmui"},
        },
        "spec": {
            "displayName": request.display_name,
            "description": request.description,
            "source": source_spec,
            "targetNamespace": request.target_namespace,
            "networkMappings": [
                {"source": m.source, "target": m.target} for m in request.network_mappings
            ],
            "storageMappings": [
                {"source": m.source, "target": m.target} for m in request.storage_mappings
            ],
            "vms": vms,
        },
    }


def _build_vm_manifest(
    plan: MigrationPlan,
    vm: VMImport,
    target_name: str,
    dv_name: str,
    ova_meta: OVAMetadata,
) -> dict:
    cpu = vm.cpu_cores or ova_meta.cpu_cores or 2
    memory_mb = vm.memory_mb or ova_meta.memory_mb or 2048
    firmware_kind = (vm.firmware or ova_meta.firmware or "bios").lower()

    firmware_spec: dict = {}
    if firmware_kind == "uefi":
        firmware_spec = {"bootloader": {"efi": {"secureBoot": False}}}

    # Networks: map the first OVA network to the first mapping target if provided,
    # else default to pod-network.
    network_name = "default"
    network_target = ""
    if plan.network_mappings:
        network_target = plan.network_mappings[0].target
    elif ova_meta.networks:
        network_target = ""  # leave unset → pod network

    networks_section: list[dict] = [{"name": network_name, "pod": {}}]
    interfaces_section: list[dict] = [{"name": network_name, "bridge": {}}]
    if network_target and network_target != "pod-network":
        nad_ref = (
            network_target if "/" in network_target else f"{plan.target_namespace}/{network_target}"
        )
        networks_section = [{"name": network_name, "multus": {"networkName": nad_ref}}]
        interfaces_section = [{"name": network_name, "bridge": {}}]

    cloud_init_user_data = _cloud_init_user_data(vm)

    volumes: list[dict] = [
        {"name": "rootdisk", "dataVolume": {"name": dv_name}},
    ]
    disks: list[dict] = [
        {"name": "rootdisk", "disk": {"bus": "virtio"}, "bootOrder": 1},
    ]
    if cloud_init_user_data:
        volumes.append(
            {
                "name": "cloudinitdisk",
                "cloudInitNoCloud": {"userData": cloud_init_user_data},
            }
        )
        disks.append({"name": "cloudinitdisk", "disk": {"bus": "virtio"}})

    template_spec: dict = {
        "domain": {
            "cpu": {"cores": cpu},
            "memory": {"guest": f"{memory_mb}Mi"},
            "devices": {
                "disks": disks,
                "interfaces": interfaces_section,
            },
            "resources": {"requests": {"memory": f"{memory_mb}Mi"}},
        },
        "networks": networks_section,
        "volumes": volumes,
    }
    if firmware_spec:
        template_spec["domain"]["firmware"] = firmware_spec

    return {
        "apiVersion": "kubevirt.io/v1",
        "kind": "VirtualMachine",
        "metadata": {
            "name": target_name,
            "namespace": plan.target_namespace,
            "labels": {
                LABEL_MANAGED_BY: "kubevmui",
                LABEL_PLAN: plan.name,
                "kubevmui.io/imported": "true",
            },
        },
        "spec": {
            "running": False,
            "template": {
                "metadata": {
                    "labels": {
                        "kubevirt.io/domain": target_name,
                        LABEL_PLAN: plan.name,
                    },
                },
                "spec": template_spec,
            },
        },
    }


def _cloud_init_user_data(vm: VMImport) -> str:
    if not vm.install_guest_agent:
        return ""
    return (
        "#cloud-config\n"
        "package_update: true\n"
        "packages:\n"
        "  - qemu-guest-agent\n"
        "runcmd:\n"
        "  - systemctl enable --now qemu-guest-agent\n"
    )


def _sanitize_vm_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c == "-" else "-" for c in name.strip().lower())
    cleaned = cleaned.strip("-") or "imported-vm"
    return cleaned[:63]


def _pvc_size_gb(disk, qcow2_path: Path) -> int:
    """Derive the PVC size in GiB from OVA capacity or the converted file."""

    if disk.capacity_bytes:
        # Round up to next GiB + 1 GiB headroom
        gb = max(1, (disk.capacity_bytes + 1024**3 - 1) // (1024**3))
        return int(gb) + 1
    size = qcow2_path.stat().st_size
    gb = max(1, (size + 1024**3 - 1) // (1024**3))
    return int(gb) + 1


def _pick_storage_class(plan: MigrationPlan, ova_meta: OVAMetadata) -> str:
    if plan.storage_mappings:
        return plan.storage_mappings[0].target
    return ""
