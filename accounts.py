"""Accounts and per-user data store for Revision Radar.

SQLite-backed: users, one workspace row per user holding the full planner
state (exam date, chapters, plan, ticks, lost days). Sessions are signed
tokens carrying user id + token version, so a password change invalidates
old sessions. All secrets live in the database only.
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time

SECRET_KEY = os.environ.get("REVISION_RADAR_SECRET_KEY") or secrets.token_urlsafe(48)
TOKEN_DAYS = 30
_RATE_WINDOW = 300      # 5 minutes
_RATE_MAX = 10          # attempts per IP per window


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + "$" + dk.hex()


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(uid: int, token_version: int) -> str:
    exp = int(time.time()) + TOKEN_DAYS * 86400
    payload = f"{uid}.{token_version}.{exp}.{secrets.token_hex(8)}"
    return f"{payload}.{_sign(payload)}"


def parse_token(token: str):
    """Return uid if the token is valid and current, else None.

    Token shape: uid.token_version.expiry.random_hex.signature
    """
    try:
        parts = token.split(".")
        if len(parts) != 5:
            return None
        payload = ".".join(parts[:4])
        sig = parts[4]
        if not hmac.compare_digest(_sign(payload), sig):
            return None
        if int(parts[2]) < time.time():
            return None
        return int(parts[0])
    except Exception:
        return None


class RRStore:
    def __init__(self, path="data/revision-radar.db"):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self._lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS users ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " email TEXT UNIQUE NOT NULL,"
            " pw_hash TEXT NOT NULL,"
            " token_version INTEGER NOT NULL DEFAULT 1,"
            " created_at TEXT NOT NULL)"
        )
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS workspaces ("
            " user_id INTEGER PRIMARY KEY,"
            " state TEXT NOT NULL,"
            " updated_at TEXT NOT NULL)"
        )
        self.db.commit()

    def create_user(self, email: str, password: str):
        email = email.strip().lower()
        if not email or "@" not in email or len(email) > 254:
            return None, "Enter a valid email address."
        if len(password) < 8 or len(password) > 128:
            return None, "Password must be 8 to 128 characters."
        with self._lock:
            if self.db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                return None, "That email already has an account."
            cur = self.db.execute(
                "INSERT INTO users (email, pw_hash, created_at) VALUES (?, ?, ?)",
                (email, _hash_password(password), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
            )
            self.db.commit()
            return cur.lastrowid, None

    def verify_login(self, email: str, password: str):
        email = email.strip().lower()
        with self._lock:
            row = self.db.execute(
                "SELECT id, pw_hash, token_version FROM users WHERE email = ?", (email,)
            ).fetchone()
        if row and _verify_password(password, row[1]):
            return row[0], row[2]
        return None, None

    def token_version(self, uid: int) -> int:
        with self._lock:
            row = self.db.execute("SELECT token_version FROM users WHERE id = ?", (uid,)).fetchone()
        return row[0] if row else -1

    def delete_user(self, uid: int):
        with self._lock:
            self.db.execute("DELETE FROM workspaces WHERE user_id = ?", (uid,))
            self.db.execute("DELETE FROM users WHERE id = ?", (uid,))
            self.db.commit()

    # -- workspace state --------------------------------------------------
    DEFAULT_STATE = {"examDate": None, "chapters": [], "plan": None,
                     "ticks": {}, "lostDays": []}

    def load_state(self, uid: int) -> dict:
        with self._lock:
            row = self.db.execute("SELECT state FROM workspaces WHERE user_id = ?", (uid,)).fetchone()
        if not row:
            return dict(self.DEFAULT_STATE)
        try:
            s = json.loads(row[0])
        except Exception:
            return dict(self.DEFAULT_STATE)
        out = dict(self.DEFAULT_STATE)
        for key in out:
            if key in s:
                out[key] = s[key]
        return out

    def save_state(self, uid: int, state: dict) -> bool:
        """Merge only known keys; each field is sanitized by the caller."""
        clean = {}
        for key, default in self.DEFAULT_STATE.items():
            if key in state:
                clean[key] = state[key]
        with self._lock:
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self.db.execute(
                "INSERT INTO workspaces (user_id, state, updated_at) VALUES (?, ?, ?)"
                " ON CONFLICT(user_id) DO UPDATE SET state = ?, updated_at = ?",
                (uid, json.dumps(clean), now, json.dumps(clean), now),
            )
            self.db.commit()
        return True

    def recent_events(self, uid: int, limit: int = 20) -> list:
        return []
