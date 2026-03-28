from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api.deps import get_cluster_manager, get_current_user
from app.main import app
from app.models.auth import UserInfo
from app.models.disk import Disk


def _mock_auth():
    return UserInfo(username="test", groups=[], authenticated=True)


def _mock_cm():
    cm = MagicMock()
    cm.get_api_client.return_value = MagicMock()
    return cm


def _make_disk(name="test-disk", namespace="default"):
    return Disk(
        name=name,
        namespace=namespace,
        size_gb=20,
        performance_tier="standard",
        storage_class="standard",
    )


def test_list_disks_returns_200():
    mock_disk = _make_disk()

    with patch("app.api.routes.storage.StorageService") as MockService:
        instance = MockService.return_value
        instance.list_disks.return_value = [mock_disk]

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/namespaces/default/disks")
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert data["total"] == 1
            assert data["items"][0]["name"] == "test-disk"
        finally:
            app.dependency_overrides.clear()


def test_list_disks_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/api/v1/clusters/local/namespaces/default/disks")
    assert resp.status_code == 401


def test_create_disk_returns_201():
    mock_disk = _make_disk()

    with patch("app.api.routes.storage.StorageService") as MockService:
        instance = MockService.return_value
        instance.create_disk.return_value = mock_disk

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/namespaces/default/disks",
                    json={
                        "name": "test-disk",
                        "namespace": "default",
                        "size_gb": 20,
                        "performance_tier": "standard",
                    },
                )
            assert resp.status_code == 201
        finally:
            app.dependency_overrides.clear()


def test_delete_disk_returns_204():
    with patch("app.api.routes.storage.StorageService") as MockService:
        instance = MockService.return_value
        instance.delete_disk.return_value = None

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.delete(
                    "/api/v1/clusters/local/namespaces/default/disks/test-disk"
                )
            assert resp.status_code == 204
        finally:
            app.dependency_overrides.clear()
