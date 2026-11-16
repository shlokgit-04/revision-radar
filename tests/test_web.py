import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app import app as flask_app


@pytest.fixture()
def client(tmp_path):
    import accounts
    import app as app_mod
    app_mod.store = accounts.RRStore(str(tmp_path / "test.db"))
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


def _register(client, email, password="Str0ngPass!23"):
    r = client.post("/api/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.get_json()["token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_auth_flow(client):
    tok = _register(client, "flow@rr.test")
    assert client.post("/api/auth/login", json={"email": "flow@rr.test", "password": "WrongPass!23"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "flow@rr.test", "password": "Str0ngPass!23"}).status_code == 200
    r = client.get("/api/state", headers=_auth(tok))
    assert r.status_code == 200 and r.get_json()["examDate"] is None
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers=_auth(tok[:-1] + ("0" if tok[-1] != "0" else "1"))).status_code == 401


def test_state_roundtrip_and_isolation(client):
    t1 = _register(client, "s1@rr.test")
    t2 = _register(client, "s2@rr.test")
    payload = {
        "examDate": "2026-12-20",
        "chapters": [{"id": "ch1", "name": "Thermodynamics", "subject": "Physics",
                      "weight": "heavy", "confidence": "weak"}],
        "ticks": {"2026-12-02_ch1_first": True},
        "lostDays": ["2026-12-01"],
    }
    assert client.put("/api/state", headers=_auth(t1), json=payload).status_code == 200
    got = client.get("/api/state", headers=_auth(t1)).get_json()
    assert got["examDate"] == "2026-12-20" and got["chapters"][0]["name"] == "Thermodynamics"
    assert got["ticks"]["2026-12-02_ch1_first"] is True and got["lostDays"] == ["2026-12-01"]
    got2 = client.get("/api/state", headers=_auth(t2)).get_json()
    assert got2["chapters"] == [] and got2["examDate"] is None


def test_state_validation(client):
    tok = _register(client, "v@rr.test")
    h = _auth(tok)
    assert client.put("/api/state", headers=h, json={"examDate": "not-a-date"}).status_code == 400
    assert client.put("/api/state", headers=h, json={"chapters": [{"id": "x;drop", "name": "A", "weight": "normal", "confidence": "weak"}]}).status_code == 400
    assert client.put("/api/state", headers=h, json={"chapters": [{"id": "x1", "name": "", "weight": "normal", "confidence": "weak"}]}).status_code == 400
    assert client.put("/api/state", headers=h, json={"chapters": [{"id": "x1", "name": "A", "weight": "huge", "confidence": "weak"}]}).status_code == 400
    assert client.put("/api/state", headers=h, json={"ticks": {"bogus": True}}).status_code == 400
    assert client.put("/api/state", headers=h, json={"lostDays": ["tomorrow"]}).status_code == 400
    assert client.put("/api/state", headers=h, json={}).status_code == 400
    assert client.put("/api/state", headers=h, json={"examDate": "2027-01-10"}).status_code == 200
    r = client.put("/api/state", headers=h, json={"chapters": [{"id": "x2", "name": "<script>alert(1)</script>", "weight": "light", "confidence": "strong"}]})
    assert r.status_code == 200


def test_export_and_delete(client):
    tok = _register(client, "ex@rr.test")
    h = _auth(tok)
    client.put("/api/state", headers=h, json={"examDate": "2026-12-20",
                                              "chapters": [{"id": "a1", "name": "Kinematics", "subject": "Physics", "weight": "normal", "confidence": "okay"}]})
    ex = client.get("/api/auth/export", headers=h).get_json()
    assert ex["workspace"]["examDate"] == "2026-12-20"
    assert client.delete("/api/auth/me", headers=h).status_code == 200
    assert client.get("/api/state", headers=h).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ex@rr.test", "password": "Str0ngPass!23"}).status_code == 401


def test_security_headers(client):
    r = client.get("/privacy")
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_pages_and_health(client):
    assert client.get("/api/health").status_code == 200
    r = client.get("/")
    assert r.status_code == 302 and "/login" in r.headers["Location"]
    assert client.get("/login").status_code == 200
    assert client.get("/register").status_code == 200
    assert client.get("/privacy").status_code == 200
    assert client.get("/about").status_code == 200
