"""Tests for the API-key subsystem under /v1/keys."""
from __future__ import annotations

import pytest

from .conftest import make_user


def test_create_key_returns_full_once(app_client, auth_module):
    _, tok = make_user(auth_module, "key-c@x.com")
    r = app_client.post(
        "/v1/keys",
        json={"name": "ci"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "ci"
    assert body["key"].startswith("vsk_live_")
    assert "…" in body["display"]


def test_list_keys_does_not_leak_secret(app_client, auth_module):
    _, tok = make_user(auth_module, "key-l@x.com")
    app_client.post(
        "/v1/keys",
        json={"name": "k1"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    r = app_client.get("/v1/keys", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    keys = r.json()["keys"]
    assert len(keys) == 1
    # Display only — full secret must NOT appear after creation.
    assert "key" not in keys[0]


def test_revoke_key_then_use_fails(app_client, auth_module):
    _, tok = make_user(auth_module, "key-r@x.com")
    create = app_client.post(
        "/v1/keys",
        json={"name": "kill"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    full_key = create.json()["key"]
    kid = create.json()["id"]

    # Revoke
    app_client.delete(f"/v1/keys/{kid}", headers={"Authorization": f"Bearer {tok}"})

    # Using the revoked key against /me must fail.
    r = app_client.get(
        "/v1/auth/me", headers={"Authorization": f"Bearer {full_key}"}
    )
    assert r.status_code == 401


def test_double_revoke_is_idempotent(app_client, auth_module):
    _, tok = make_user(auth_module, "key-d@x.com")
    cid = (
        app_client.post(
            "/v1/keys",
            json={"name": "k"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        .json()["id"]
    )
    a = app_client.delete(f"/v1/keys/{cid}", headers={"Authorization": f"Bearer {tok}"})
    b = app_client.delete(f"/v1/keys/{cid}", headers={"Authorization": f"Bearer {tok}"})
    assert a.status_code == 200
    assert b.status_code == 200
    assert b.json().get("already_revoked") is True


def test_create_requires_auth(app_client):
    r = app_client.post("/v1/keys", json={"name": "x"})
    assert r.status_code == 401


@pytest.mark.security
def test_user_cannot_revoke_others_key(app_client, auth_module):
    """Tenant isolation: user A's key id is not deletable by user B."""
    _, tok_a = make_user(auth_module, "a@x.com")
    _, tok_b = make_user(auth_module, "b@x.com")

    cid = (
        app_client.post(
            "/v1/keys",
            json={"name": "a-key"},
            headers={"Authorization": f"Bearer {tok_a}"},
        )
        .json()["id"]
    )

    # B tries to revoke A's key.
    r = app_client.delete(
        f"/v1/keys/{cid}", headers={"Authorization": f"Bearer {tok_b}"}
    )
    assert r.status_code == 404  # appears nonexistent to B

    # A's key still works.
    keys = app_client.get(
        "/v1/keys", headers={"Authorization": f"Bearer {tok_a}"}
    ).json()["keys"]
    assert len(keys) == 1
    assert keys[0]["revoked_at"] is None


@pytest.mark.security
def test_user_cannot_list_others_keys(app_client, auth_module):
    _, tok_a = make_user(auth_module, "list-a@x.com")
    _, tok_b = make_user(auth_module, "list-b@x.com")
    app_client.post(
        "/v1/keys",
        json={"name": "a"},
        headers={"Authorization": f"Bearer {tok_a}"},
    )
    r = app_client.get("/v1/keys", headers={"Authorization": f"Bearer {tok_b}"})
    assert r.status_code == 200
    assert r.json()["keys"] == []


def test_api_key_works_as_bearer_for_me(app_client, auth_module):
    """Created key, used in lieu of JWT, returns the same user."""
    _, tok = make_user(auth_module, "swap@x.com")
    full = (
        app_client.post(
            "/v1/keys",
            json={"name": "swap"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        .json()["key"]
    )
    r = app_client.get(
        "/v1/auth/me", headers={"Authorization": f"Bearer {full}"}
    )
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "swap@x.com"


def test_last_used_at_updates_on_use(app_client, auth_module):
    _, tok = make_user(auth_module, "lu@x.com")
    full = (
        app_client.post(
            "/v1/keys",
            json={"name": "lu"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        .json()["key"]
    )

    before = (
        app_client.get("/v1/keys", headers={"Authorization": f"Bearer {tok}"})
        .json()["keys"][0]["last_used_at"]
    )
    assert before is None

    # Use it.
    app_client.get("/v1/auth/me", headers={"Authorization": f"Bearer {full}"})

    after = (
        app_client.get("/v1/keys", headers={"Authorization": f"Bearer {tok}"})
        .json()["keys"][0]["last_used_at"]
    )
    assert after is not None


@pytest.mark.edge
@pytest.mark.parametrize(
    "name",
    [
        "x",
        "a" * 80,
        "with spaces",
        "🔥 emoji",
        "正常 unicode",
    ],
)
def test_create_key_accepts_varied_names(app_client, auth_module, name):
    _, tok = make_user(auth_module, f"e-{abs(hash(name))%1000}@x.com")
    r = app_client.post(
        "/v1/keys",
        json={"name": name},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
