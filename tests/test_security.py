"""Cross-cutting security regressions — tenant isolation, header
spoofing, brute force, and Codeforces-style malformed inputs."""
from __future__ import annotations

import threading

import pytest

from .conftest import make_user


# ---------- tenant isolation -----------------------------------------------

@pytest.mark.security
def test_user_cannot_revoke_another_users_key(app_client, auth_module):
    _, ta = make_user(auth_module, "iso-a@x.com")
    _, tb = make_user(auth_module, "iso-b@x.com")
    cid = (
        app_client.post(
            "/v1/keys",
            json={"name": "victim"},
            headers={"Authorization": f"Bearer {ta}"},
        )
        .json()["id"]
    )
    r = app_client.delete(f"/v1/keys/{cid}", headers={"Authorization": f"Bearer {tb}"})
    assert r.status_code == 404


@pytest.mark.security
def test_users_payments_isolated(app_client, auth_module):
    _, ta = make_user(auth_module, "py-a@x.com")
    _, tb = make_user(auth_module, "py-b@x.com")
    # Insert payment for user A directly into DB.
    with auth_module.db() as c:
        c.execute(
            "INSERT INTO payments (user_id, order_id, package_id, amount_inr, credits, status) "
            "VALUES (1, 'vaani-1-aaa', 'starter', 99, 1000, 'PAID')"
        )
    a_pays = app_client.get(
        "/v1/billing/payments", headers={"Authorization": f"Bearer {ta}"}
    ).json()["payments"]
    b_pays = app_client.get(
        "/v1/billing/payments", headers={"Authorization": f"Bearer {tb}"}
    ).json()["payments"]
    assert len(a_pays) == 1
    assert b_pays == []


# ---------- brute force / replay -------------------------------------------

@pytest.mark.security
@pytest.mark.slow
def test_login_brute_force_does_not_succeed(app_client):
    """Hammer 50 wrong passwords against one account, then try the right
    one. The right one must still work (no lockout for v1, but no false
    positive either)."""
    app_client.post(
        "/v1/auth/signup",
        json={"email": "brute@x.com", "password": "passw0rd!"},
    )
    for i in range(50):
        r = app_client.post(
            "/v1/auth/login",
            json={"email": "brute@x.com", "password": f"wrong-{i}"},
        )
        assert r.status_code == 401
    good = app_client.post(
        "/v1/auth/login",
        json={"email": "brute@x.com", "password": "passw0rd!"},
    )
    assert good.status_code == 200


# ---------- header spoofing ------------------------------------------------

@pytest.mark.security
def test_bearer_header_case_insensitive_prefix(app_client, auth_module):
    """`Bearer`, `bearer`, `BEARER` should all be honored."""
    _, tok = make_user(auth_module, "hdr@x.com")
    for prefix in ("Bearer", "bearer", "BEARER"):
        r = app_client.get(
            "/v1/auth/me", headers={"Authorization": f"{prefix} {tok}"}
        )
        assert r.status_code == 200, prefix


@pytest.mark.security
def test_bearer_bare_token_no_prefix_rejected(app_client, auth_module):
    """No `Bearer ` prefix → not a bearer auth, must reject."""
    _, tok = make_user(auth_module, "np@x.com")
    r = app_client.get("/v1/auth/me", headers={"Authorization": tok})
    assert r.status_code == 401


@pytest.mark.security
def test_bearer_with_extra_whitespace_handled(app_client, auth_module):
    _, tok = make_user(auth_module, "ws@x.com")
    r = app_client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer  {tok}  "},
    )
    # Either rejects strictly (401) or strips whitespace (200) — but never
    # leaks the user / 500s.
    assert r.status_code in (200, 401)


# ---------- concurrent ops -------------------------------------------------

@pytest.mark.security
@pytest.mark.slow
def test_concurrent_signup_same_email_one_wins(app_client):
    """20 threads racing on the same email — exactly one 200, the rest 409."""
    results: list[int] = []
    lock = threading.Lock()

    def attempt():
        r = app_client.post(
            "/v1/auth/signup",
            json={"email": "race@x.com", "password": "passw0rd!"},
        )
        with lock:
            results.append(r.status_code)

    threads = [threading.Thread(target=attempt) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert results.count(200) == 1
    # Remaining all 409 (or 500 in pathological races would be a real bug).
    assert all(r in (200, 409) for r in results), results


# ---------- malformed payloads --------------------------------------------

@pytest.mark.security
@pytest.mark.parametrize(
    "payload",
    [
        b'',                       # empty body
        b'{',                      # not JSON
        b'{"email":1}',            # email not a string
        b'{"email":null,"password":null}',
        b'\x00\x01\x02',           # binary garbage
        b'{"email":"x","password":"' + b'A' * 10_000 + b'"}',  # huge pw
    ],
)
def test_malformed_signup_does_not_500(app_client, payload):
    """API must return 4xx (validation error), never crash with 5xx."""
    r = app_client.post(
        "/v1/auth/signup",
        content=payload,
        headers={"Content-Type": "application/json"},
    )
    assert 400 <= r.status_code < 500, (r.status_code, r.text[:200])


# ---------- no token leakage in error responses ----------------------------

@pytest.mark.security
def test_error_responses_do_not_echo_secrets(app_client, auth_module):
    """If you send a bogus token, the 401 body must not echo it back —
    that helps if logs leak."""
    bogus = "vsk_live_secret_should_not_appear_anywhere"
    r = app_client.get(
        "/v1/auth/me", headers={"Authorization": f"Bearer {bogus}"}
    )
    assert r.status_code == 401
    assert "secret_should_not_appear" not in r.text
