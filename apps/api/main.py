"""Vaani API gateway — v1 MVP.

Endpoints:
    GET  /                       service info
    GET  /healthz                liveness
    GET  /v1/voices              list voices
    POST /v1/audio/speech        TTS (OpenAI-shape input)

Single-process design: the VibeVoice realtime model is loaded once at startup.
All inference requests are serialized through an asyncio lock — concurrent
generations on one GPU would corrupt KV state and fight for VRAM.
"""
from __future__ import annotations

import asyncio
import copy
import glob
import io
import logging
import os
import re
import tempfile
import time
import urllib.request
import urllib.error
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import structlog
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from vibevoice.modular.modeling_vibevoice_streaming_inference import (
    VibeVoiceStreamingForConditionalGenerationInference,
)
from vibevoice.processor.vibevoice_streaming_processor import VibeVoiceStreamingProcessor

logging.getLogger("transformers").setLevel(logging.ERROR)
log = structlog.get_logger()

MODEL_PATH = os.environ.get(
    "VAANI_TTS_MODEL", os.path.expanduser("~/vaani/models/VibeVoice-Realtime-0.5B")
)
VOICES_DIR = os.environ.get(
    "VAANI_VOICES_DIR",
    os.path.expanduser("~/vaani/external/VibeVoice/demo/voices/streaming_model"),
)
from typing import Optional  # noqa: E402

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SAMPLE_RATE = 24000

HI_WORKER_URL = os.environ.get("VAANI_HI_WORKER", "http://127.0.0.1:8003")
USER_VOICES_DIR = Path(
    os.environ.get("VAANI_USER_VOICES_DIR", "/home/ubuntu/vaani/data/voices")
)
MAX_VOICE_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_VOICES_PER_USER = 20
SLUG_RE = re.compile(r"[^a-z0-9]+")


def _scan_voices(voices_dir: str) -> dict[str, str]:
    """Map short voice IDs to .pt paths.

    File naming convention from the upstream repo: <lang>-<Name>_<gender>.pt.
    We expose the lowercase short name (e.g. "carter", "emma", "samuel") as
    the public ID, plus the full filename stem as a fully-qualified alias.
    """
    voices: dict[str, str] = {}
    for path in sorted(glob.glob(os.path.join(voices_dir, "*.pt"))):
        stem = Path(path).stem  # e.g. "en-Carter_man"
        voices[stem.lower()] = path
        # Extract short name: between first '-' and last '_'
        if "-" in stem and "_" in stem:
            short = stem.split("-", 1)[1].rsplit("_", 1)[0].lower()
            voices.setdefault(short, path)
    return voices


class Engine:
    """Holds the loaded model + voice cache. One instance per process."""

    def __init__(self) -> None:
        self.processor = None
        self.model = None
        self.voices: dict[str, str] = {}
        self.voice_cache: dict[str, dict] = {}
        self.lock = asyncio.Lock()
        self.ready = False

    def load(self) -> None:
        log.info("loading_processor", path=MODEL_PATH)
        self.processor = VibeVoiceStreamingProcessor.from_pretrained(MODEL_PATH)
        log.info("loading_model", path=MODEL_PATH, device=DEVICE)
        t0 = time.time()
        self.model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
            MODEL_PATH,
            torch_dtype=torch.bfloat16 if DEVICE == "cuda" else torch.float32,
            device_map=DEVICE,
            attn_implementation="sdpa",
        )
        self.model.eval()
        self.model.set_ddpm_inference_steps(num_steps=5)
        self.voices = _scan_voices(VOICES_DIR)
        log.info(
            "model_loaded",
            seconds=round(time.time() - t0, 2),
            voices=len(self.voices),
        )
        self._warmup()
        self.ready = True

    def _warmup(self) -> None:
        """Force kernel JIT + voice deserialization at startup so the first
        user request doesn't pay a multi-second cold-start penalty.

        We pre-load every voice prompt into the voice cache (cheap), and run
        a long-enough generation to JIT every common kernel shape. The
        per-voice prompt cache is size-uniform so a single warmup
        generation covers all voices for kernel JIT."""
        for vid in list(self.voices.keys()):
            try:
                self._get_voice(vid)
            except Exception as e:
                log.warning("voice_preload_failed", id=vid, error=str(e))

        warm_voice = next(
            (v for v in ("en-carter_man", "en-emma_woman") if v in self.voices),
            next(iter(self.voices), None),
        )
        if warm_voice is None:
            log.warning("warmup_skipped_no_voices")
            return
        warm_text = (
            "This is a longer warmup sentence to ensure the model exercises "
            "every diffusion-step kernel shape and language-model cache path "
            "before serving a first real user request."
        )
        try:
            t0 = time.time()
            self.synthesize(warm_text, warm_voice, cfg_scale=1.5)
            log.info(
                "warmup_done", voice=warm_voice, seconds=round(time.time() - t0, 2)
            )
        except Exception as e:
            log.warning("warmup_failed", error=str(e))

    def _get_voice(self, voice_id: str) -> dict:
        """Reload from disk every call. Caching the deserialized dict and
        deepcopying it for each generation appears to leave shared state
        (probably DynamicCache internals) that causes the model to skip
        EOS and run to the 8192-token context cap. ~50ms disk hit is cheap
        compared to the 70s blow-up it prevents."""
        key = voice_id.lower()
        if key not in self.voices:
            raise KeyError(voice_id)
        path = self.voices[key]
        return torch.load(path, map_location=DEVICE, weights_only=False)

    def synthesize(self, text: str, voice_id: str, cfg_scale: float) -> bytes:
        # Re-pin diffusion steps each call: the scheduler appears to drift
        # back toward its default (~100 steps) after first use, which makes
        # every request after the first ~20× slower.
        self.model.set_ddpm_inference_steps(num_steps=5)

        voice = self._get_voice(voice_id)
        inputs = self.processor.process_input_with_cached_prompt(
            text=text,
            cached_prompt=voice,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(DEVICE)

        out = self.model.generate(
            **inputs,
            max_new_tokens=None,
            cfg_scale=cfg_scale,
            tokenizer=self.processor.tokenizer,
            generation_config={"do_sample": False},
            verbose=False,
            all_prefilled_outputs=copy.deepcopy(voice),
        )
        if DEVICE == "cuda":
            torch.cuda.empty_cache()
        if not out.speech_outputs or out.speech_outputs[0] is None:
            raise RuntimeError("empty audio output")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            self.processor.save_audio(out.speech_outputs[0], output_path=tmp)
            with open(tmp, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass


engine = Engine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.load()
    yield


app = FastAPI(title="Vaani API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://vaani.shubhamiitbhu.in",
        "http://localhost:5173",
        "http://localhost:4173",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

from . import auth as auth_module  # noqa: E402

auth_module.init_db()
app.include_router(auth_module.router)
app.include_router(auth_module.keys_router)

from . import billing as billing_module  # noqa: E402

app.include_router(billing_module.router)


class SpeechRequest(BaseModel):
    input: str = Field(..., min_length=1, max_length=4000)
    voice: str = Field(default="carter")
    response_format: str = Field(default="wav")
    cfg_scale: float = Field(default=1.5, ge=0.5, le=3.0)


def _info() -> dict:
    return {
        "service": "vaani",
        "version": "0.1.0",
        "tts_model": "microsoft/VibeVoice-Realtime-0.5B",
        "ready": engine.ready,
        "studio": "https://vaani.shubhamiitbhu.in",
    }


@app.get("/")
def root():
    return _info()


@app.get("/api/info")
def info():
    return _info()


@app.get("/healthz")
def healthz():
    if not engine.ready:
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok"}


def _fetch_hi_voices() -> list[dict]:
    """Best-effort fetch of Hindi worker voices. Returns [] if it's down."""
    try:
        req = urllib.request.Request(
            f"{HI_WORKER_URL}/v1/voices",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            import json as _json
            data = _json.loads(resp.read().decode())
            return data.get("voices", [])
    except (urllib.error.URLError, OSError, ValueError):
        return []


def _slugify(s: str) -> str:
    out = SLUG_RE.sub("-", s.lower()).strip("-")
    return out or "voice"


def _user_voices(user_id: int) -> list[dict]:
    with auth_module.db() as c:
        rows = c.execute(
            "SELECT * FROM user_voices WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["voice_id"],
            "stem": r["name"],
            "language": "custom",
            "user": True,
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def _lookup_user_voice(voice_id: str, user_id: int) -> Optional[str]:
    """Return the file path if this user owns this voice, else None."""
    with auth_module.db() as c:
        row = c.execute(
            "SELECT file_path FROM user_voices WHERE voice_id = ? AND user_id = ?",
            (voice_id, user_id),
        ).fetchone()
    return row["file_path"] if row else None


@app.get("/v1/voices")
def list_voices(request: Request):
    local = [
        {"id": vid, "stem": Path(p).stem, "language": vid.split("-")[0]}
        for vid, p in sorted(engine.voices.items())
        if vid == Path(p).stem.lower()  # de-dupe: only canonical IDs
    ]
    voices = local + _fetch_hi_voices()
    user = auth_module.current_user(request)
    if user:
        voices = voices + _user_voices(user["id"])
    return {"voices": voices}


@app.post("/v1/voices/upload")
async def upload_voice(
    name: str = Form(..., min_length=1, max_length=40),
    file: UploadFile = File(...),
    user: dict = Depends(auth_module.required_user),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")
    if len(raw) > MAX_VOICE_BYTES:
        raise HTTPException(413, f"file exceeds {MAX_VOICE_BYTES // 1024 // 1024} MB cap")
    if not raw.startswith(b"RIFF") or b"WAVE" not in raw[:16]:
        raise HTTPException(400, "expected a .wav (RIFF/WAVE) file")

    with auth_module.db() as c:
        count = c.execute(
            "SELECT COUNT(*) AS n FROM user_voices WHERE user_id = ?", (user["id"],)
        ).fetchone()["n"]
    if count >= MAX_VOICES_PER_USER:
        raise HTTPException(429, f"per-user voice limit ({MAX_VOICES_PER_USER}) reached")

    base_slug = _slugify(name)
    user_dir = USER_VOICES_DIR / f"user{user['id']}"
    user_dir.mkdir(parents=True, exist_ok=True)

    slug = base_slug
    voice_id = f"user{user['id']}-{slug}"
    n = 2
    while (user_dir / f"{slug}.wav").exists() or _lookup_user_voice(voice_id, user["id"]):
        slug = f"{base_slug}-{n}"
        voice_id = f"user{user['id']}-{slug}"
        n += 1

    out_path = user_dir / f"{slug}.wav"
    out_path.write_bytes(raw)

    with auth_module.db() as c:
        c.execute(
            "INSERT INTO user_voices (user_id, name, voice_id, file_path) VALUES (?,?,?,?)",
            (user["id"], name, voice_id, str(out_path)),
        )

    log.info(
        "voice_uploaded",
        user_id=user["id"],
        voice_id=voice_id,
        bytes=len(raw),
    )
    return {
        "id": voice_id,
        "stem": name,
        "language": "custom",
        "user": True,
    }


@app.delete("/v1/voices/{voice_id}")
def delete_voice(
    voice_id: str, user: dict = Depends(auth_module.required_user)
):
    path = _lookup_user_voice(voice_id, user["id"])
    if not path:
        raise HTTPException(404, "voice not found")
    try:
        os.unlink(path)
    except OSError:
        pass
    with auth_module.db() as c:
        c.execute(
            "DELETE FROM user_voices WHERE voice_id = ? AND user_id = ?",
            (voice_id, user["id"]),
        )
    log.info("voice_deleted", user_id=user["id"], voice_id=voice_id)
    return {"ok": True}


def _proxy_to_hi(input_text: str, voice: str, cfg_scale: float) -> bytes:
    """Synchronous-on-purpose: called via asyncio.to_thread."""
    import json as _json
    body = _json.dumps(
        {"input": input_text, "voice": voice, "cfg_scale": cfg_scale}
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{HI_WORKER_URL}/v1/audio/speech",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise HTTPException(e.code, f"hi worker: {detail}")
    except urllib.error.URLError as e:
        raise HTTPException(503, f"hi worker unavailable: {e.reason}")


@app.post("/v1/audio/speech")
async def create_speech(req: SpeechRequest, request: Request):
    if not engine.ready:
        raise HTTPException(503, "model still loading")
    if req.response_format != "wav":
        raise HTTPException(400, "only response_format=wav is supported in v1")

    voice_lower = req.voice.lower()

    # User-uploaded cloned voice: lookup ownership, then proxy to the Hindi
    # worker with the absolute path of the stored .wav (the worker accepts
    # either a preset key or an absolute path).
    if voice_lower.startswith("user"):
        user = auth_module.current_user(request)
        if not user:
            raise HTTPException(401, "authentication required for user voices")
        path = _lookup_user_voice(req.voice, user["id"])
        if not path:
            raise HTTPException(404, f"voice '{req.voice}' not found for this user")
        t0 = time.time()
        wav = await asyncio.to_thread(_proxy_to_hi, req.input, path, req.cfg_scale)
        log.info(
            "synth_done_user", chars=len(req.input), voice=req.voice,
            bytes=len(wav), seconds=round(time.time() - t0, 2),
        )
        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"X-Vaani-Generation-Seconds": f"{time.time() - t0:.2f}"},
        )

    # Hindi presets live in a separate worker process. Proxy POSTs transparently.
    if voice_lower.startswith("hi-"):
        t0 = time.time()
        wav = await asyncio.to_thread(_proxy_to_hi, req.input, req.voice, req.cfg_scale)
        log.info(
            "synth_done_hi", chars=len(req.input), voice=req.voice,
            bytes=len(wav), seconds=round(time.time() - t0, 2),
        )
        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"X-Vaani-Generation-Seconds": f"{time.time() - t0:.2f}"},
        )

    if voice_lower not in engine.voices:
        raise HTTPException(
            400,
            f"unknown voice '{req.voice}'. See GET /v1/voices.",
        )

    t0 = time.time()
    async with engine.lock:
        wav = await asyncio.to_thread(
            engine.synthesize, req.input, req.voice, req.cfg_scale
        )
    log.info(
        "synth_done",
        chars=len(req.input),
        voice=req.voice,
        bytes=len(wav),
        seconds=round(time.time() - t0, 2),
    )
    return Response(
        content=wav,
        media_type="audio/wav",
        headers={"X-Vaani-Generation-Seconds": f"{time.time() - t0:.2f}"},
    )
