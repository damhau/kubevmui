from fastapi.testclient import TestClient

from app.main import app


def test_health_no_auth_required():
    with TestClient(app) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200


def test_login_missing_token():
    with TestClient(app) as client:
        resp = client.post("/api/v1/auth/login", json={})
        assert resp.status_code == 422


def test_login_with_fake_token():
    with TestClient(app) as client:
        resp = client.post("/api/v1/auth/login", json={"token": "fake-token"})
        assert resp.status_code in (200, 401)
