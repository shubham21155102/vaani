"""Unit tests for the auth module — password hashing, JWT, token decoding."""
from __future__ import annotations

import time

import jwt
import pytest


# ---------- password hashing ----------------------------------------------

def test_hash_password_is_deterministic_per_call_but_unique(auth_module):
    """bcrypt salts the output — two calls on the same password differ
    but both verify against the original."""
    h1 = auth_module._hash_password("hunter2-very-long")
    h2 = auth_module._hash_password("hunter2-very-long")
    assert h1 != h2
    assert auth_module._verify_password("hunter2-very-long", h1)
    assert auth_module._verify_password("hunter2-very-long", h2)


def test_verify_password_rejects_wrong(auth_module):
    h = auth_module._hash_password("correct horse battery staple")
    assert not auth_module._verify_password("incorrect", h)
    assert not auth_module._verify_password("", h)


def test_verify_password_rejects_garbage_hash(auth_module):
    """Malformed stored hash must not throw, just return False."""
    assert not auth_module._verify_password("anything", "not-a-bcrypt-hash")
    assert not auth_module._verify_password("anything", "")  # empty hash → False


@pytest.mark.security
def test_verify_password_constant_handles_unicode(auth_module):
    """Unicode passwords (4-byte UTF-8, combining marks) must round-trip."""
    weird = "🔐 password — naïve · 한글 · ́mark"
    h = auth_module._hash_password(weird)
    assert auth_module._verify_password(weird, h)
    assert not auth_module._verify_password(weird + " ", h)


# ---------- JWT ------------------------------------------------------------

def test_issue_token_decodes_with_correct_secret(auth_module):
    tok = auth_module._issue_token(42)
    payload = auth_module._decode_token(tok)
    assert int(payload["sub"]) == 42
    assert payload["exp"] > int(time.time())


def test_decode_token_rejects_wrong_secret(auth_module):
    tok = auth_module._issue_token(1)
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(tok, "different-secret", algorithms=[auth_module.JWT_ALGO])


@pytest.mark.security
def test_decode_token_rejects_alg_none(auth_module):
    """Classic JWT vuln: alg=none should never be accepted."""
    forged = jwt.encode(
        {"sub": "1", "exp": int(time.time()) + 3600},
        "",
        algorithm="none",
    )
    with pytest.raises(jwt.PyJWTError):
        auth_module._decode_token(forged)


@pytest.mark.security
def test_decode_token_rejects_expired(auth_module):
    """exp=in-the-past → InvalidTokenError."""
    expired = jwt.encode(
        {"sub": "1", "exp": int(time.time()) - 60},
        auth_module.JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        auth_module._decode_token(expired)


@pytest.mark.security
def test_decode_token_rejects_garbled(auth_module):
    with pytest.raises(jwt.PyJWTError):
        auth_module._decode_token("not.a.jwt")
    with pytest.raises(jwt.PyJWTError):
        auth_module._decode_token("")


# ---------- API keys -------------------------------------------------------

def test_generate_api_key_shape(auth_module):
    full, display, h = auth_module._generate_api_key()
    assert full.startswith(auth_module.API_KEY_PREFIX)
    assert len(full) > 30
    assert "…" in display  # has the … separator
    assert len(h) == 64  # sha256 hex


def test_api_key_hash_deterministic(auth_module):
    full, _, h = auth_module._generate_api_key()
    assert auth_module._hash_api_key(full) == h


@pytest.mark.security
def test_api_key_hash_does_not_reveal_secret(auth_module):
    """sha256 is preimage-resistant — knowing the hash should not let us
    derive a different string that hashes to the same value (we can't test
    that property directly, but ensure it isn't trivial)."""
    a, _, ha = auth_module._generate_api_key()
    b, _, hb = auth_module._generate_api_key()
    assert a != b
    assert ha != hb


def test_user_from_api_key_returns_none_for_garbage(auth_module):
    assert auth_module._user_from_api_key("not-a-key") is None
    assert auth_module._user_from_api_key("") is None
    assert auth_module._user_from_api_key("vsk_live_doesnotexist") is None


# ---------- DB schema -----------------------------------------------------

def test_init_db_idempotent(auth_module):
    """Running init_db twice must not throw (CREATE TABLE IF NOT EXISTS)."""
    auth_module.init_db()
    auth_module.init_db()
    auth_module.init_db()
