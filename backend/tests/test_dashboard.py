from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api.deps import get_cluster_manager, get_current_user
from app.main import app
from app.models.auth import UserInfo
from app.models.common import HealthStatus, VMStatus
from app.models.vm import VM, VMCompute


def _mock_auth():
    return UserInfo(username="test", groups=[], authenticated=True)


def _mock_cm():
    cm = MagicMock()
    cm.get_api_client.return_value = MagicMock()
    return cm


def _make_vm(name="vm1", status=VMStatus.running):
    return VM(
        name=name,
        namespace="default",
        status=status,
        health=HealthStatus.healthy,
        compute=VMCompute(cpu_cores=2, memory_mb=2048),
    )


def test_dashboard_returns_200():
    running_vm = _make_vm("vm1", VMStatus.running)
    stopped_vm = _make_vm("vm2", VMStatus.stopped)
    error_vm = _make_vm("vm3", VMStatus.error)

    with (
        patch("app.api.routes.dashboard.KubeVirtClient") as MockKV,
        patch("app.api.routes.dashboard.VMService") as MockService,
    ):
        kv_instance = MockKV.return_value
        kv_instance.list_namespaces.return_value = ["default"]
        kv_instance.list_nodes.return_value = [{"name": "node1"}, {"name": "node2"}]

        svc_instance = MockService.return_value
        svc_instance.list_vms.return_value = [running_vm, stopped_vm, error_vm]

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/dashboard")
            assert resp.status_code == 200
            data = resp.json()
            assert "total_vms" in data
            assert "running_vms" in data
            assert "stopped_vms" in data
            assert "error_vms" in data
            assert "node_count" in data
            assert data["total_vms"] == 3
            assert data["running_vms"] == 1
            assert data["stopped_vms"] == 1
            assert data["error_vms"] == 1
            assert data["node_count"] == 2
        finally:
            app.dependency_overrides.clear()


def test_dashboard_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/api/v1/clusters/local/dashboard")
    assert resp.status_code == 401


def test_dashboard_cluster_not_found():
    def _mock_cm_no_client():
        cm = MagicMock()
        cm.get_api_client.return_value = None
        return cm

    app.dependency_overrides[get_current_user] = _mock_auth
    app.dependency_overrides[get_cluster_manager] = _mock_cm_no_client

    try:
        with TestClient(app) as client:
            resp = client.get("/api/v1/clusters/nonexistent/dashboard")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_namespaces_returns_200():
    with patch("app.api.routes.namespaces.KubeVirtClient") as MockKV:
        kv_instance = MockKV.return_value
        kv_instance.list_namespaces.return_value = ["default", "kube-system"]

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/namespaces")
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert "total" in data
            assert data["total"] == 2
        finally:
            app.dependency_overrides.clear()
