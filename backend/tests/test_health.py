from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_returns_fields():
    resp = client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["database"] in {"connected", "unreachable"}
    assert body["status"] in {"ok", "degraded"}
    assert isinstance(body["time"], float)


def test_healthz_also_served_under_api_prefix():
    resp = client.get("/api/healthz")
    assert resp.status_code == 200
