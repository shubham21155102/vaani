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

import logging
import os

import structlog
from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    WorkerOptions,
    cli,
)
from livekit.plugins import openai, silero

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

    session = AgentSession(
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
        tts=openai.TTS(
            model=TTS_MODEL,
            voice=TTS_VOICE,
            base_url=GROQ_BASE,
            api_key=GROQ_API_KEY,
        ),
        vad=silero.VAD.load(),
    )

    await session.start(
        agent=Agent(instructions=AGENT_PROMPT),
        room=ctx.room,
        room_input_options=RoomInputOptions(),
    )

    await session.generate_reply(
        instructions=(
            "Greet the user warmly in one sentence and ask how you can help. "
            "Mention you can answer questions about Vaani."
        )
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
