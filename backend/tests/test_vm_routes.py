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


def _make_vm(name="test-vm", namespace="default"):
    return VM(
        name=name,
        namespace=namespace,
        status=VMStatus.running,
        health=HealthStatus.healthy,
        compute=VMCompute(cpu_cores=2, memory_mb=2048),
    )


def test_list_vms_requires_auth():
    """Without auth override, should return 401."""
    with TestClient(app) as client:
        resp = client.get("/api/v1/clusters/local/namespaces/default/vms")
    assert resp.status_code == 401


def test_list_vms_with_mocked_auth():
    """With mocked auth and cluster manager, should return 200."""
    mock_vm = _make_vm()

    with patch("app.api.routes.vms.VMService") as MockService:
        instance = MockService.return_value
        instance.list_vms.return_value = [mock_vm]

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/namespaces/default/vms")
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert data["total"] == 1
            assert data["items"][0]["name"] == "test-vm"
        finally:
            app.dependency_overrides.clear()


def test_get_vm_not_found():
    """When VM not found, should return 404."""
    with patch("app.api.routes.vms.VMService") as MockService:
        instance = MockService.return_value
        instance.get_vm.return_value = None

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/namespaces/default/vms/nonexistent")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


def test_get_vm_found():
    """When VM found, should return 200 with VM data."""
    mock_vm = _make_vm()

    with patch("app.api.routes.vms.VMService") as MockService:
        instance = MockService.return_value
        instance.get_vm.return_value = mock_vm

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/namespaces/default/vms/test-vm")
            assert resp.status_code == 200
            data = resp.json()
            assert data["name"] == "test-vm"
        finally:
            app.dependency_overrides.clear()


def test_vm_action_invalid():
    """Invalid action should return 400."""
    app.dependency_overrides[get_current_user] = _mock_auth
    app.dependency_overrides[get_cluster_manager] = _mock_cm

    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/clusters/local/namespaces/default/vms/test-vm/explode"
            )
        assert resp.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_vm_action_valid():
    """Valid action should return 200."""
    with patch("app.api.routes.vms.VMService") as MockService:
        instance = MockService.return_value
        instance.vm_action.return_value = None

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/namespaces/default/vms/test-vm/start"
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


def test_delete_vm():
    """Delete VM should return 204."""
    with patch("app.api.routes.vms.VMService") as MockService:
        instance = MockService.return_value
        instance.delete_vm.return_value = None

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.delete(
                    "/api/v1/clusters/local/namespaces/default/vms/test-vm"
                )
            assert resp.status_code == 204
        finally:
            app.dependency_overrides.clear()
