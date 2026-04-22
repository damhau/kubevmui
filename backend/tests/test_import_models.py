"""Model-level tests for the VM Import feature."""

from app.models.import_vm import (
    MigrationPlan,
    MigrationPlanCreate,
    PlanPhase,
    SourceConfig,
    SourceType,
    VMImport,
    VMImportStatus,
    VMPhase,
)


def test_source_config_defaults():
    cfg = SourceConfig(type=SourceType.OVA)
    assert cfg.type == SourceType.OVA
    assert cfg.ova_upload_id == ""
    assert cfg.insecure_skip_verify is False
    assert cfg.winrm_port is None


def test_migration_plan_create_round_trip():
    req = MigrationPlanCreate(
        name="migrate-web",
        display_name="Migrate Web",
        source=SourceConfig(type=SourceType.OVA, ova_upload_id="abc123"),
        target_namespace="production",
        vms=[
            VMImport(source_vm_id="vm-1", source_name="web-01", capture_as_image=True),
        ],
    )
    assert req.vms[0].capture_as_image is True
    assert req.source.type == SourceType.OVA


def test_vm_import_status_defaults():
    vs = VMImportStatus(name="web-01")
    assert vs.phase == VMPhase.PENDING
    assert vs.progress == 0
    assert vs.disk_statuses == []


def test_migration_plan_status_enum_round_trip():
    plan = MigrationPlan(
        name="p",
        display_name="p",
        source=SourceConfig(type=SourceType.OVA),
        target_namespace="default",
    )
    assert plan.status.phase == PlanPhase.PENDING
    plan.status.phase = PlanPhase.IN_PROGRESS
    assert plan.status.phase.value == "InProgress"
