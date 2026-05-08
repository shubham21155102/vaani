"""LiveKit agent token endpoint.

Browsers POST /v1/agent/token (with their JWT or API key) → we issue a
LiveKit access token good for one room (`vaani-<user_id>`). The browser
then connects to wss://livekit.shubhamiitbhu.in with that token and
publishes/subscribes audio to the room. The Python agent worker
(apps/agent/main.py) listens for room-join events and joins the same
room as a participant, running the VAD→STT→LLM→TTS loop.
"""
from __future__ import annotations

import os
from datetime import timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException
from livekit import api as lk_api  # type: ignore[import-not-found]

from . import auth as auth_module

log = structlog.get_logger()

LK_URL = os.environ.get("VAANI_LIVEKIT_URL", "wss://livekit.shubhamiitbhu.in")
LK_API_KEY = os.environ.get("VAANI_LIVEKIT_API_KEY", "")
LK_API_SECRET = os.environ.get("VAANI_LIVEKIT_API_SECRET", "")

router = APIRouter(prefix="/v1/agent", tags=["agent"])


@router.post("/token")
def token(user: dict = Depends(auth_module.required_user)):
    if not (LK_API_KEY and LK_API_SECRET):
        raise HTTPException(503, "agent: LiveKit credentials not configured")

    room_name = f"vaani-{user['id']}"
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
        .with_grants(grants)
        .with_ttl(timedelta(hours=1))
        .to_jwt()
    )
    log.info("agent_token_issued", user_id=user["id"], room=room_name)
    return {"url": LK_URL, "token": jwt, "room": room_name}
