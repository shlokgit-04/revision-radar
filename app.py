"""Revision Radar web app: the full-stack home of the backwards revision planner.

The scheduler itself (plan.js) stays a pure client-side module; the server
owns accounts, per-user plan state, and security. Every user's syllabus,
plan, ticks and lost days live server-side behind a signed session token.
"""
import json
import re
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, redirect, render_template, request
from flask_cors import CORS

from accounts import RRStore, make_token, parse_token, _RATE_MAX, _RATE_WINDOW

app = Flask(__name__)
CORS(app, supports_credentials=True)

store = RRStore()

WEIGHTS = {"heavy", "normal", "light"}
CONFS = {"weak", "okay", "strong"}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISO_DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
MAX_CHAPTERS = 120
MAX_TICKS = 5000


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@app.after_request
def set_security_headers(resp):
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; "
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    )
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return resp


def current_uid():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    uid = parse_token(token)
    if uid is None:
        return None
    if store.token_version(uid) < 0:
        return None  # account deleted
    return uid


def _check_token_version(uid: int, token: str) -> bool:
    # token_version is embedded inside the signed payload; parse_token already
    # validated the signature. Re-verify the version matches the user's.
    try:
        ver = int(token.split(".")[1])
    except Exception:
        return False
    return ver == store.token_version(uid)


def rate_limited(ip: str) -> bool:
    key = f"rl:{ip}"
    now = time.time()
    # in-memory sliding window; survives process life, good enough for free tier
    hits = _RATE_HITS.get(ip)
    if not hits or now - hits[0] > _RATE_WINDOW:
        _RATE_HITS[ip] = [now]
        return False
    hits.append(now)
    while hits and now - hits[0] > _RATE_WINDOW:
        hits.pop(0)
    return len(hits) > _RATE_MAX


_RATE_HITS = {}


def auth_required():
    uid = current_uid()
    if uid is None:
        return None
    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip()
    if not _check_token_version(uid, token):
        return None
    return uid


# -- pages ---------------------------------------------------------------
@app.get("/")
def index():
    if current_uid() is None:
        return redirect("/login")
    return render_template("app.html")


@app.get("/login")
def login_page():
    if current_uid() is not None:
        return redirect("/")
    return render_template("login.html")


@app.get("/register")
def register_page():
    if current_uid() is not None:
        return redirect("/")
    return render_template("register.html")


@app.get("/privacy")
def privacy_page():
    return render_template("privacy.html")


@app.get("/about")
def about_page():
    return render_template("about.html")


# -- auth ----------------------------------------------------------------
@app.post("/api/auth/register")
def api_register():
    if rate_limited(request.remote_addr or "?"):
        return jsonify(error="Too many attempts. Wait 5 minutes."), 429
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", ""))
    password = str(body.get("password", ""))
    uid, err = store.create_user(email, password)
    if err:
        return jsonify(error=err), 400
    token = make_token(uid, store.token_version(uid))
    return jsonify(token=token)


@app.post("/api/auth/login")
def api_login():
    if rate_limited(request.remote_addr or "?"):
        return jsonify(error="Too many attempts. Wait 5 minutes."), 429
    body = request.get_json(silent=True) or {}
    uid, version = store.verify_login(str(body.get("email", "")), str(body.get("password", "")))
    if uid is None:
        return jsonify(error="Wrong email or password."), 401
    return jsonify(token=make_token(uid, version))


@app.get("/api/auth/me")
def api_me():
    uid = auth_required()
    if uid is None:
        return jsonify(error="Not signed in."), 401
    return jsonify(store.load_state(uid) | {"uid": uid})


@app.get("/api/auth/export")
def api_export():
    uid = auth_required()
    if uid is None:
        return jsonify(error="Not signed in."), 401
    return jsonify({"email": _user_email(uid), "workspace": store.load_state(uid),
                    "exportedAt": _iso_now()})


def _user_email(uid):
    with store._lock:
        row = store.db.execute("SELECT email FROM users WHERE id = ?", (uid,)).fetchone()
    return row[0] if row else None


@app.delete("/api/auth/me")
def api_delete():
    uid = auth_required()
    if uid is None:
        return jsonify(error="Not signed in."), 401
    store.delete_user(uid)
    return jsonify(ok=True)


# -- workspace state -----------------------------------------------------
def _sanitize_state(uid, body):
    """Validate and normalize the whole workspace payload server-side."""
    out = {}
    exam = body.get("examDate")
    if exam is not None:
        exam = str(exam)
        if not ISO_DATE.match(exam):
            return None, "Invalid exam date."
        out["examDate"] = exam

    chapters = body.get("chapters")
    if chapters is not None:
        if not isinstance(chapters, list) or len(chapters) > MAX_CHAPTERS:
            return None, "Too many chapters."
        clean = []
        seen = set()
        for c in chapters:
            if not isinstance(c, dict):
                return None, "Invalid chapter."
            name = str(c.get("name", "")).strip()[:200]
            if not name:
                return None, "Chapter name cannot be empty."
            subject = str(c.get("subject", "")).strip()[:100]
            weight = str(c.get("weight", "normal"))
            conf = str(c.get("confidence", "weak"))
            if weight not in WEIGHTS or conf not in CONFS:
                return None, "Invalid chapter weight or confidence."
            cid = str(c.get("id", ""))[:40]
            if not re.match(r"^[A-Za-z0-9_-]+$", cid):
                return None, "Invalid chapter id."
            if cid in seen:
                return None, "Duplicate chapter id."
            seen.add(cid)
            clean.append({"id": cid, "name": name, "subject": subject,
                          "weight": weight, "confidence": conf})
        out["chapters"] = clean

    plan = body.get("plan")
    if plan is not None:
        if not isinstance(plan, dict):
            return None, "Invalid plan."
        days = plan.get("days")
        if not isinstance(days, list) or len(days) > 400:
            return None, "Invalid plan days."
        for day in days:
            if not isinstance(day, dict) or not ISO_DATE.match(str(day.get("date", ""))):
                return None, "Invalid plan day."
            blocks = day.get("blocks")
            if blocks is None:
                blocks = []
            if not isinstance(blocks, list) or len(blocks) > 20:
                return None, "Invalid plan blocks."
            for b in blocks:
                if not isinstance(b, dict):
                    return None, "Invalid plan block."
                if str(b.get("chapterId", ""))[:40] == "":
                    return None, "Invalid plan block id."
                if b.get("kind") not in ("first", "revision"):
                    return None, "Invalid plan block kind."
        if plan.get("panic") not in (True, False, None):
            return None, "Invalid plan flag."
        cuts = plan.get("cuts")
        if cuts is not None:
            if not isinstance(cuts, list) or len(cuts) > 20:
                return None, "Invalid cuts."
            cuts = [str(x)[:300] for x in cuts]
        gen = plan.get("generatedAt")
        if gen is not None and not ISO_DT.match(str(gen)):
            return None, "Invalid plan timestamp."
        out["plan"] = {"days": days, "cuts": cuts or [],
                       "panic": bool(plan.get("panic")),
                       "generatedAt": str(gen) if gen else None}

    ticks = body.get("ticks")
    if ticks is not None:
        if not isinstance(ticks, dict) or len(ticks) > MAX_TICKS:
            return None, "Too many ticks."
        clean = {}
        for key in ticks:
            k = str(key)
            m = re.match(r"^(\d{4}-\d{2}-\d{2})_([A-Za-z0-9_-]{1,40})_(first|revision)$", k)
            if not m:
                return None, "Invalid tick key."
            clean[k] = True
        out["ticks"] = clean

    lost = body.get("lostDays")
    if lost is not None:
        if not isinstance(lost, list) or len(lost) > 400:
            return None, "Invalid lost days."
        for d in lost:
            if not ISO_DATE.match(str(d)):
                return None, "Invalid lost day."
        out["lostDays"] = [str(d) for d in lost]

    return out, None


@app.get("/api/state")
def api_state_get():
    uid = auth_required()
    if uid is None:
        return jsonify(error="Not signed in."), 401
    return jsonify(store.load_state(uid))


@app.put("/api/state")
def api_state_put():
    uid = auth_required()
    if uid is None:
        return jsonify(error="Not signed in."), 401
    body = request.get_json(silent=True) or {}
    clean, err = _sanitize_state(uid, body)
    if err:
        return jsonify(error=err), 400
    if not clean:
        return jsonify(error="Nothing to save."), 400
    store.save_state(uid, clean)
    return jsonify(ok=True, state=store.load_state(uid))


@app.get("/api/audit")
def api_audit():
    uid = auth_required()
    if uid is None:
        return jsonify(error="Not signed in."), 401
    return jsonify(events=store.recent_events(uid))


@app.get("/api/health")
def api_health():
    return jsonify(ok=True, service="revision-radar")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
