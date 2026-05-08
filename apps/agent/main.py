"""Vaani LiveKit agent worker.

Connects to the self-hosted LiveKit at wss://livekit.shubhamiitbhu.in,
gets dispatched into rooms when users hit /agent in the Studio,
and runs the realtime voice loop:

    user mic ──→ silero VAD ──→ Groq Whisper STT ──→ Groq Qwen3-32B LLM ──→ Groq PlayAI TTS ──→ user speakers

The Vaani TTS plugin (apps/agent/vaani_tts.py) replaces Groq TTS once
verified — leaving that swap as a one-line change.

Run modes:
    python -m apps.agent.main dev      # local dev, attaches to one room
    python -m apps.agent.main start    # production, registers as a worker

Required env (loaded by systemd EnvironmentFile=):
    LIVEKIT_URL         wss://livekit.shubhamiitbhu.in
    LIVEKIT_API_KEY     APIK...
    LIVEKIT_API_SECRET  ...
    VAANI_GROQ_API_KEY  gsk_...
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import structlog
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    ConversationItemAddedEvent,
    JobContext,
    RoomInputOptions,
    UserInputTranscribedEvent,
    WorkerOptions,
    cli,
)
from livekit.plugins import openai, silero

from .vaani_plugins import VaaniSTT, VaaniTTS

PRESETS_PATH = Path(__file__).resolve().parents[1] / "shared" / "agent_presets.json"


def _load_presets() -> dict:
    try:
        with open(PRESETS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


PRESETS = _load_presets()
DEFAULT_PRESET = {
    "name": "Vaani Assistant",
    "voice": "en-emma_woman",
    "instructions": (
        "You are Vaani, a friendly voice assistant. "
        "Speak in short, natural sentences."
    ),
    "greeting": "Greet the user warmly and ask how you can help.",
}

logging.getLogger("livekit").setLevel(logging.INFO)
log = structlog.get_logger()

GROQ_BASE = "https://api.groq.com/openai/v1"
GROQ_API_KEY = os.environ.get("VAANI_GROQ_API_KEY", "")
LLM_MODEL = os.environ.get("VAANI_GROQ_LLM_MODEL", "qwen/qwen3-32b")
STT_MODEL = os.environ.get("VAANI_GROQ_STT_MODEL", "whisper-large-v3")
TTS_MODEL = os.environ.get("VAANI_GROQ_TTS_MODEL", "playai-tts")
TTS_VOICE = os.environ.get("VAANI_GROQ_TTS_VOICE", "Aaliyah-PlayAI")

AGENT_PROMPT = (
    "You are Vaani, a friendly real-time voice assistant for the Vaani voice-AI "
    "platform. Speak in short, natural sentences suitable for spoken delivery — "
    "no markdown, no bullet points, no emoji. If the user asks technical "
    "questions about Vaani, you can mention TTS, STT, voice cloning, Hindi "
    "support, and the API at vaani-api.shubhamiitbhu.in. Keep each response "
    "under three sentences unless the user asks for more detail."
)


async def entrypoint(ctx: JobContext) -> None:
    log.info("agent_join", room=ctx.room.name)
    await ctx.connect()

    if not GROQ_API_KEY:
        log.error("missing_groq_key")
        raise RuntimeError("VAANI_GROQ_API_KEY env var is required")

    # Wait for the user to join, then read their metadata for agent_id.
    participant = await ctx.wait_for_participant()
    agent_id = "general"
    try:
        if participant.metadata:
            agent_id = json.loads(participant.metadata).get("agent_id", "general")
    except (json.JSONDecodeError, AttributeError):
        pass

    preset = PRESETS.get(agent_id) or DEFAULT_PRESET
    log.info("agent_preset_selected", agent_id=agent_id, voice=preset.get("voice"))

    session = AgentSession(
        # STT: Groq Whisper for ~200ms turn latency. VibeVoice-ASR (long-form,
        # slow per-turn) stays as the engine behind /v1/audio/transcriptions
        # for the file-upload Studio page, but isn't used in realtime calls.
        stt=openai.STT(
            model=STT_MODEL,
            base_url=GROQ_BASE,
            api_key=GROQ_API_KEY,
        ),
        llm=openai.LLM(
            model=LLM_MODEL,
            base_url=GROQ_BASE,
            api_key=GROQ_API_KEY,
        ),
        tts=VaaniTTS(voice=preset.get("voice", "en-emma_woman")),
        vad=silero.VAD.load(),
    )

    # Stream transcripts to the SPA via a reliable data channel — the
    # /agent page listens for {"role":..., "text":...} JSON.
    # publish_data is async; schedule the coroutine instead of calling it.
    import asyncio as _asyncio

    def _publish(role: str, text: str) -> None:
        payload = json.dumps({"role": role, "text": text}).encode("utf-8")
        try:
            coro = ctx.room.local_participant.publish_data(payload, reliable=True)
            _asyncio.create_task(coro)
        except Exception as e:
            log.warning("publish_data_failed", error=str(e))

    @session.on("user_input_transcribed")
    def _on_user(ev: "UserInputTranscribedEvent") -> None:
        if ev.is_final and ev.transcript:
            _publish("user", ev.transcript)

    @session.on("conversation_item_added")
    def _on_item(ev: "ConversationItemAddedEvent") -> None:
        item = ev.item
        # The same event fires for AgentHandoff and other shapes that have no
        # `role` — only forward real chat messages.
        role = getattr(item, "role", None)
        if role != "assistant":
            return
        text = (
            getattr(item, "text_content", None)
            or getattr(item, "content", None)
            or ""
        )
        if text:
            _publish("assistant", str(text))

    await session.start(
        agent=Agent(instructions=preset.get("instructions", DEFAULT_PRESET["instructions"])),
        room=ctx.room,
        room_input_options=RoomInputOptions(),
    )

    await session.generate_reply(
        instructions=preset.get("greeting", DEFAULT_PRESET["greeting"])
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
