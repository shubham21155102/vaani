"""LiveKit agent token endpoint.

Browsers POST /v1/agent/token (with their JWT or API key) → we issue a
LiveKit access token good for one room (`vaani-<user_id>`). The browser
then connects to wss://livekit.shubhamiitbhu.in with that token and
publishes/subscribes audio to the room. The Python agent worker
(apps/agent/main.py) listens for room-join events and joins the same
room as a participant, running the VAD→STT→LLM→TTS loop.
"""
from __future__ import annotations

import json
import os
from datetime import timedelta
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, HTTPException
from livekit import api as lk_api  # type: ignore[import-not-found]
from pydantic import BaseModel, Field

from . import auth as auth_module

log = structlog.get_logger()

LK_URL = os.environ.get("VAANI_LIVEKIT_URL", "wss://livekit.shubhamiitbhu.in")
LK_API_KEY = os.environ.get("VAANI_LIVEKIT_API_KEY", "")
LK_API_SECRET = os.environ.get("VAANI_LIVEKIT_API_SECRET", "")

PRESETS_PATH = Path(__file__).resolve().parents[1] / "shared" / "agent_presets.json"


def _load_presets() -> dict:
    try:
        with open(PRESETS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        log.warning("agent_presets_load_failed", error=str(e))
        return {}


router = APIRouter(prefix="/v1/agent", tags=["agent"])


class TokenReq(BaseModel):
    agent_id: str = Field(default="general", min_length=1, max_length=40)


@router.get("/agents")
def list_agents():
    presets = _load_presets()
    return {
        "agents": [
            {
                "id": k,
                "name": v.get("name", k),
                "description": v.get("description", ""),
                "voice": v.get("voice", ""),
            }
            for k, v in presets.items()
        ]
    }


@router.post("/token")
def token(
    req: TokenReq | None = None,
    user: dict = Depends(auth_module.required_user),
):
    if not (LK_API_KEY and LK_API_SECRET):
        raise HTTPException(503, "agent: LiveKit credentials not configured")

    presets = _load_presets()
    agent_id = (req.agent_id if req else "general")
    if agent_id not in presets:
        agent_id = "general"

    room_name = f"vaani-{user['id']}-{agent_id}"
    grants = lk_api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    )
    jwt = (
        lk_api.AccessToken(LK_API_KEY, LK_API_SECRET)
        .with_identity(f"user{user['id']}")
        .with_name(user.get("display_name") or user["email"].split("@")[0])
        .with_metadata(json.dumps({"agent_id": agent_id}))
        .with_grants(grants)
        .with_ttl(timedelta(hours=1))
        .to_jwt()
    )
    log.info(
        "agent_token_issued",
        user_id=user["id"],
        room=room_name,
        agent_id=agent_id,
    )
    return {
        "url": LK_URL,
        "token": jwt,
        "room": room_name,
        "agent_id": agent_id,
    }
