"""Tests for the LiveKit agent token endpoint + preset listing."""
from __future__ import annotations

import json

import pytest

from .conftest import make_user


def test_list_agents_requires_auth(app_client):
    r = app_client.get("/v1/agent/agents")
    assert r.status_code == 401


def test_list_agents_returns_5_presets(app_client, auth_module):
    _, tok = make_user(auth_module, "agents@x.com")
    r = app_client.get(
        "/v1/agent/agents", headers={"Authorization": f"Bearer {tok}"}
    )
    assert r.status_code == 200
    ids = {a["id"] for a in r.json()["agents"]}
    # We ship 5 personalities; tighter assertion than 'len ≥ 1'.
    assert {"general", "support", "storyteller", "tutor", "hindi"} <= ids


def test_token_unauthed_401(app_client):
    r = app_client.post("/v1/agent/token", json={"agent_id": "general"})
    assert r.status_code == 401


def test_token_returns_jwt_with_room_and_metadata(
    app_client, auth_module, agent_routes_module
):
    user, tok = make_user(auth_module, "tk@x.com")
    r = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "general"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["url"].startswith("wss://")
    assert body["room"] == f"vaani-{user['id']}-general"
    assert body["agent_id"] == "general"
    assert body["token"].count(".") == 2  # JWT shape


def test_unknown_agent_id_falls_back_to_general(
    app_client, auth_module
):
    _, tok = make_user(auth_module, "fb@x.com")
    r = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "nonexistent-presetzz"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    assert r.json()["agent_id"] == "general"


def test_voice_override_passes_through(app_client, auth_module):
    _, tok = make_user(auth_module, "vo@x.com")
    r = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "general", "voice": "en-carter_man"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    assert r.json()["voice"] == "en-carter_man"


@pytest.mark.security
def test_user_voice_id_for_other_user_is_dropped(
    app_client, auth_module
):
    """Token endpoint resolves user-* IDs to absolute paths only when the
    caller owns them. An attacker passing user42-something they don't own
    must fall back to the preset default."""
    _, tok = make_user(auth_module, "atk@x.com")
    r = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "general", "voice": "user99-not-mine"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    body = r.json()
    # Should fall back to the preset's default voice — definitely not the
    # foreign cloned-voice id.
    assert body["voice"] != "user99-not-mine"
    assert body["voice"]  # something real returned


def test_token_resolves_own_cloned_voice_to_path(
    app_client, auth_module, tmp_path
):
    user, tok = make_user(auth_module, "own@x.com")
    fake_path = str(tmp_path / "u.wav")
    with open(fake_path, "wb") as f:
        f.write(b"RIFF" + b"\x00" * 20)
    voice_id = f"user{user['id']}-mine"
    with auth_module.db() as c:
        c.execute(
            "INSERT INTO user_voices (user_id, name, voice_id, file_path) VALUES (?,?,?,?)",
            (user["id"], "mine", voice_id, fake_path),
        )

    r = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "general", "voice": voice_id},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    # Server returns the resolved abs path — that's by design (so the
    # browser-side LiveKit metadata can carry it through).
    assert r.json()["voice"] == fake_path


def test_load_presets_returns_dict(agent_routes_module):
    p = agent_routes_module._load_presets()
    assert isinstance(p, dict)
    assert "general" in p
    assert "voice" in p["general"]
    assert "instructions" in p["general"]


@pytest.mark.edge
def test_make_token_room_name_includes_agent(
    app_client, auth_module
):
    """Different agents → different room names so two pages can hold two
    agents simultaneously without colliding."""
    user, tok = make_user(auth_module, "rm@x.com")
    a = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "general"},
        headers={"Authorization": f"Bearer {tok}"},
    ).json()
    b = app_client.post(
        "/v1/agent/token",
        json={"agent_id": "storyteller"},
        headers={"Authorization": f"Bearer {tok}"},
    ).json()
    assert a["room"] != b["room"]
    assert a["room"].endswith("-general")
    assert b["room"].endswith("-storyteller")
