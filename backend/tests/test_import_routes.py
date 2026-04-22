"""Route-level tests for /import and /migration-plans."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api.deps import get_cluster_manager, get_current_user
from app.main import app
from app.models.auth import UserInfo
from app.models.import_vm import (
    MigrationPlan,
    PlanPhase,
    SourceConfig,
    SourceType,
    ValidationResult,
)


def _mock_auth():
    return UserInfo(username="test", groups=[], authenticated=True)


def _mock_cm():
    cm = MagicMock()
    cm.get_api_client.return_value = MagicMock()
    return cm


def _make_plan(name: str = "p1") -> MigrationPlan:
    return MigrationPlan(
        name=name,
        display_name="Plan 1",
        source=SourceConfig(type=SourceType.OVA, ova_upload_id="abc"),
        target_namespace="default",
    )


def test_list_plans_returns_200():
    with patch("app.api.routes.import_vm.ImportService") as Svc:
        Svc.return_value.list_plans.return_value = [_make_plan()]
        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm
        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/migration-plans")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 1
            assert data["items"][0]["name"] == "p1"
        finally:
            app.dependency_overrides.clear()


def test_get_plan_404():
    with patch("app.api.routes.import_vm.ImportService") as Svc:
        Svc.return_value.get_plan.return_value = None
        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm
        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/migration-plans/nope")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


def test_create_plan_501_for_hyperv():
    app.dependency_overrides[get_current_user] = _mock_auth
    app.dependency_overrides[get_cluster_manager] = _mock_cm
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/clusters/local/migration-plans",
                json={
                    "name": "p",
                    "display_name": "p",
                    "source": {"type": "hyperv", "endpoint": "h", "credentials_ref": "s"},
                    "target_namespace": "default",
                    "vms": [],
                },
            )
        # Unimplemented source types return 501 for the foundation PR
        assert resp.status_code == 501
    finally:
        app.dependency_overrides.clear()


def test_create_plan_accepts_ova():
    plan = _make_plan()
    with patch("app.api.routes.import_vm.ImportService") as Svc:
        svc = Svc.return_value
        svc.create_plan.return_value = plan
        svc.start_plan.return_value = None
        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm
        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/migration-plans",
                    json={
                        "name": "p1",
                        "display_name": "Plan 1",
                        "source": {"type": "ova", "ova_upload_id": "abc"},
                        "target_namespace": "default",
                        "vms": [],
                    },
                )
            assert resp.status_code == 201
            data = resp.json()
            assert data["name"] == "p1"
            assert data["status"]["phase"] == PlanPhase.PENDING.value
            svc.start_plan.assert_called_once_with("p1")
        finally:
            app.dependency_overrides.clear()


def test_delete_plan_returns_204():
    with patch("app.api.routes.import_vm.ImportService") as Svc:
        Svc.return_value.delete_plan.return_value = None
        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm
        try:
            with TestClient(app) as client:
                resp = client.delete("/api/v1/clusters/local/migration-plans/p1")
            assert resp.status_code == 204
        finally:
            app.dependency_overrides.clear()


def test_validate_rejects_unknown_source():
    with patch("app.api.routes.import_vm.ImportService") as Svc:
        svc = Svc.return_value
        svc.kv.list_namespaces.return_value = ["default"]
        svc.kv.list_vms.return_value = []
        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm
        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/import/validate",
                    json={
                        "name": "p",
                        "display_name": "p",
                        "source": {"type": "hyperv", "endpoint": "h"},
                        "target_namespace": "default",
                        "vms": [],
                    },
                )
            assert resp.status_code == 200
            body = ValidationResult(**resp.json())
            assert body.ok is True  # not-implemented is a warning, not an error
            assert any("not yet implemented" in w for w in body.warnings)
        finally:
            app.dependency_overrides.clear()


def test_validate_reports_missing_namespace():
    with patch("app.api.routes.import_vm.ImportService") as Svc:
        svc = Svc.return_value
        svc.kv.list_namespaces.return_value = ["default"]
        svc.kv.list_vms.return_value = []
        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm
        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/import/validate",
                    json={
                        "name": "p",
                        "display_name": "p",
                        "source": {"type": "ova", "ova_upload_id": "x"},
                        "target_namespace": "missing-ns",
                        "vms": [],
                    },
                )
            body = ValidationResult(**resp.json())
            assert body.ok is False
            assert any("missing-ns" in e for e in body.errors)
        finally:
            app.dependency_overrides.clear()


def test_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/api/v1/clusters/local/migration-plans")
    assert resp.status_code == 401
