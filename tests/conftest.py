"""Shared fixtures for the backend test suite.

Sets env vars before any apps.api.* module is imported, so module-level
constants (JWT_SECRET, DB_PATH, …) read sane test values.
"""
from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path

# Set env BEFORE importing apps.api.* — the modules read these at import.
os.environ.setdefault("VAANI_JWT_SECRET", "test-" + secrets.token_urlsafe(48))
os.environ.setdefault(
    "VAANI_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com"
)
os.environ.setdefault("VAANI_CASHFREE_BASE", "https://sandbox.cashfree.com")
os.environ.setdefault("VAANI_CASHFREE_APP_ID", "TEST_APP_ID_001")
os.environ.setdefault("VAANI_CASHFREE_SECRET", "cfsk_ma_test_" + "x" * 40)
os.environ.setdefault("VAANI_CASHFREE_API_VERSION", "2023-08-01")
os.environ.setdefault("VAANI_PUBLIC_BASE", "https://test.vaani.local")
os.environ.setdefault("VAANI_LIVEKIT_URL", "wss://test-livekit.local")
os.environ.setdefault("VAANI_LIVEKIT_API_KEY", "APIKtest123")
os.environ.setdefault("VAANI_LIVEKIT_API_SECRET", "test-secret-" + "x" * 32)
os.environ.setdefault("VAANI_GROQ_API_KEY", "gsk_test_dummy")

# Make repo root importable so `from apps.api import auth` works.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402


@pytest.fixture
def auth_module(tmp_path, monkeypatch):
    """Fresh in-memory-ish SQLite per test by repointing DB_PATH."""
    from apps.api import auth as _auth

    monkeypatch.setattr(_auth, "DB_PATH", tmp_path / "vaani.sqlite")
    _auth.init_db()
    return _auth


@pytest.fixture
def billing_module(monkeypatch):
    """Reload billing with fresh env (CASHFREE_*) — uses real auth.db()."""
    from apps.api import billing as _billing

    return _billing


@pytest.fixture
def agent_routes_module(monkeypatch):
    from apps.api import agent_routes as _ar

    return _ar


@pytest.fixture
def app_client(auth_module):
    """A minimal FastAPI app with auth + keys + billing + agent routers
    mounted, returned as a TestClient. Does NOT load model code."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from apps.api import billing as _billing
    from apps.api import agent_routes as _ar

    app = FastAPI()
    app.include_router(auth_module.router)
    app.include_router(auth_module.keys_router)
    app.include_router(_billing.router)
    app.include_router(_ar.router)
    return TestClient(app)


def make_user(auth_module, email: str = "u@test.local", password: str = "12345678"):
    """Helper: signup directly into the test DB and return (user_dict, token)."""
    pw_hash = auth_module._hash_password(password)
    with auth_module.db() as c:
        cur = c.execute(
            "INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)",
            (email, pw_hash, "Test"),
        )
        uid = cur.lastrowid
        row = c.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    user = auth_module._row_to_user(row)
    token = auth_module._issue_token(uid)
    return user, token
