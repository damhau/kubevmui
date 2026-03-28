from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api.deps import get_cluster_manager, get_current_user
from app.main import app
from app.models.auth import UserInfo
from app.models.common import NetworkType
from app.models.network_profile import NetworkProfile


def _mock_auth():
    return UserInfo(username="test", groups=[], authenticated=True)


def _mock_cm():
    cm = MagicMock()
    cm.get_api_client.return_value = MagicMock()
    return cm


def _make_profile(name="test-net", namespace="default"):
    return NetworkProfile(
        name=name,
        namespace=namespace,
        display_name="Test Network",
        network_type=NetworkType.bridge,
    )


def test_list_networks_returns_200():
    mock_profile = _make_profile()

    with patch("app.api.routes.networks.NetworkService") as MockService:
        instance = MockService.return_value
        instance.list_profiles.return_value = [mock_profile]

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/namespaces/default/networks")
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert data["total"] == 1
            assert data["items"][0]["name"] == "test-net"
        finally:
            app.dependency_overrides.clear()


def test_list_networks_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/api/v1/clusters/local/namespaces/default/networks")
    assert resp.status_code == 401


def test_create_network_returns_201():
    mock_profile = _make_profile()

    with patch("app.api.routes.networks.NetworkService") as MockService:
        instance = MockService.return_value
        instance.create_profile.return_value = mock_profile

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/namespaces/default/networks",
                    json={
                        "name": "test-net",
                        "namespace": "default",
                        "display_name": "Test Network",
                        "network_type": "bridge",
                    },
                )
            assert resp.status_code == 201
        finally:
            app.dependency_overrides.clear()


def test_delete_network_returns_204():
    with patch("app.api.routes.networks.NetworkService") as MockService:
        instance = MockService.return_value
        instance.delete_profile.return_value = None

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.delete(
                    "/api/v1/clusters/local/namespaces/default/networks/test-net"
                )
            assert resp.status_code == 204
        finally:
            app.dependency_overrides.clear()
