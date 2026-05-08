"""Integration tests for /v1/auth/* via FastAPI TestClient."""
from __future__ import annotations

import pytest

from .conftest import make_user


# ---------- /signup --------------------------------------------------------

def test_signup_returns_token_and_user(app_client, auth_module):
    r = app_client.post(
        "/v1/auth/signup",
        json={"email": "alice@x.com", "password": "passw0rd!", "display_name": "Alice"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["token"].count(".") == 2  # JWT shape
    assert body["user"]["email"] == "alice@x.com"
    assert body["user"]["credits"] == 999  # default starter credits


def test_signup_duplicate_email_409(app_client, auth_module):
    payload = {"email": "dup@x.com", "password": "passw0rd!"}
    assert app_client.post("/v1/auth/signup", json=payload).status_code == 200
    r2 = app_client.post("/v1/auth/signup", json=payload)
    assert r2.status_code == 409


def test_signup_short_password_422(app_client):
    r = app_client.post(
        "/v1/auth/signup",
        json={"email": "x@y.com", "password": "short"},
    )
    assert r.status_code == 422


def test_signup_invalid_email_422(app_client):
    r = app_client.post(
        "/v1/auth/signup",
        json={"email": "not-an-email", "password": "passw0rd!"},
    )
    assert r.status_code == 422


@pytest.mark.security
@pytest.mark.parametrize(
    "evil_email",
    [
        "a@b.com'; DROP TABLE users;--",
        "a@b.com\x00admin",
        "a@b.com\nset-cookie: x=y",
        "a@b.com" + "A" * 500,  # extremely long
    ],
)
def test_signup_resists_injection(app_client, auth_module, evil_email):
    """Email parser must reject these or DB layer must escape them.
    Either way: users table must remain intact afterward."""
    app_client.post(
        "/v1/auth/signup",
        json={"email": evil_email, "password": "passw0rd!"},
    )
    # Ensure users table is still queryable.
    with auth_module.db() as c:
        rows = c.execute("SELECT COUNT(*) AS n FROM users").fetchone()
        assert rows["n"] >= 0


@pytest.mark.edge
def test_signup_email_normalisation(app_client):
    """Email is stored lowercased."""
    app_client.post(
        "/v1/auth/signup",
        json={"email": "MIXED@Case.COM", "password": "passw0rd!"},
    )
    r = app_client.post(
        "/v1/auth/login",
        json={"email": "mixed@case.com", "password": "passw0rd!"},
    )
    assert r.status_code == 200


# ---------- /login ---------------------------------------------------------

def test_login_happy_path(app_client):
    app_client.post(
        "/v1/auth/signup",
        json={"email": "bob@x.com", "password": "passw0rd!"},
    )
    r = app_client.post(
        "/v1/auth/login",
        json={"email": "bob@x.com", "password": "passw0rd!"},
    )
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password_401(app_client):
    app_client.post(
        "/v1/auth/signup",
        json={"email": "carol@x.com", "password": "passw0rd!"},
    )
    r = app_client.post(
        "/v1/auth/login",
        json={"email": "carol@x.com", "password": "wrong-pw"},
    )
    assert r.status_code == 401


def test_login_unknown_user_401(app_client):
    r = app_client.post(
        "/v1/auth/login",
        json={"email": "ghost@x.com", "password": "passw0rd!"},
    )
    assert r.status_code == 401


@pytest.mark.security
def test_login_response_for_unknown_vs_wrongpw_is_uniform(app_client):
    """Both should be 401 with identical body — don't leak whether the
    email exists."""
    app_client.post(
        "/v1/auth/signup",
        json={"email": "leak@x.com", "password": "passw0rd!"},
    )
    a = app_client.post(
        "/v1/auth/login",
        json={"email": "leak@x.com", "password": "wrong"},
    )
    b = app_client.post(
        "/v1/auth/login",
        json={"email": "ghost-not-real@x.com", "password": "wrong"},
    )
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


# ---------- /me ------------------------------------------------------------

def test_me_with_jwt(app_client, auth_module):
    user, token = make_user(auth_module, "me@x.com")
    r = app_client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "me@x.com"


def test_me_without_token_401(app_client):
    r = app_client.get("/v1/auth/me")
    assert r.status_code == 401


def test_me_with_garbage_token_401(app_client):
    r = app_client.get(
        "/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"}
    )
    assert r.status_code == 401


@pytest.mark.security
def test_me_with_wrong_secret_jwt_401(app_client, auth_module):
    """JWT signed with a different secret must not be accepted."""
    import jwt as _jwt

    forged = _jwt.encode({"sub": "1", "exp": 9999999999}, "wrong-secret", algorithm="HS256")
    r = app_client.get(
        "/v1/auth/me", headers={"Authorization": f"Bearer {forged}"}
    )
    assert r.status_code == 401


# ---------- /logout --------------------------------------------------------

def test_logout_returns_ok(app_client):
    """Stateless JWT — logout is a no-op server-side."""
    r = app_client.post("/v1/auth/logout")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
