from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api.deps import get_cluster_manager, get_current_user
from app.main import app
from app.models.auth import UserInfo
from app.models.template import Template
from app.models.vm import VMCompute


def _mock_auth():
    return UserInfo(username="test", groups=[], authenticated=True)


def _mock_cm():
    cm = MagicMock()
    cm.get_api_client.return_value = MagicMock()
    return cm


def _make_template(name="test-tpl"):
    return Template(
        name=name,
        display_name="Test Template",
        compute=VMCompute(cpu_cores=2, memory_mb=2048),
    )


def test_list_templates_returns_200():
    mock_tpl = _make_template()

    with patch("app.api.routes.templates.TemplateService") as MockService:
        instance = MockService.return_value
        instance.list_templates.return_value = [mock_tpl]

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.get("/api/v1/clusters/local/templates")
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert data["total"] == 1
            assert data["items"][0]["name"] == "test-tpl"
        finally:
            app.dependency_overrides.clear()


def test_list_templates_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/api/v1/clusters/local/templates")
    assert resp.status_code == 401


def test_create_template_returns_201():
    mock_tpl = _make_template()

    with patch("app.api.routes.templates.TemplateService") as MockService:
        instance = MockService.return_value
        instance.create_template.return_value = mock_tpl

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/clusters/local/templates",
                    json={
                        "name": "test-tpl",
                        "display_name": "Test Template",
                        "compute": {"cpu_cores": 2, "memory_mb": 2048},
                    },
                )
            assert resp.status_code == 201
        finally:
            app.dependency_overrides.clear()


def test_delete_template_returns_204():
    with patch("app.api.routes.templates.TemplateService") as MockService:
        instance = MockService.return_value
        instance.delete_template.return_value = None

        app.dependency_overrides[get_current_user] = _mock_auth
        app.dependency_overrides[get_cluster_manager] = _mock_cm

        try:
            with TestClient(app) as client:
                resp = client.delete(
                    "/api/v1/clusters/local/templates/test-tpl"
                )
            assert resp.status_code == 204
        finally:
            app.dependency_overrides.clear()
