"""Vaani Hindi TTS worker — tarun7r/vibevoice-hindi-1.5B.

Lives on 127.0.0.1:8003 in a third venv (community fork of VibeVoice that
retained the full multi-speaker TTS code Microsoft pulled). The main TTS
gateway on :8001 proxies POST /v1/audio/speech here when the requested
voice ID starts with `hi-`.
"""
from __future__ import annotations

import asyncio
import glob
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from vibevoice.modular.modeling_vibevoice_inference import (  # type: ignore[import-not-found]
    VibeVoiceForConditionalGenerationInference,
)
from vibevoice.processor.vibevoice_processor import (  # type: ignore[import-not-found]
    VibeVoiceProcessor,
)

logging.getLogger("transformers").setLevel(logging.ERROR)
log = structlog.get_logger()

MODEL_PATH = os.environ.get(
    "VAANI_HI_MODEL", "/home/ubuntu/vaani/models/vibevoice-hindi-1.5B"
)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class Engine:
    def __init__(self) -> None:
        self.processor = None
        self.model = None
        self.voices: dict[str, str] = {}
        self.lock = asyncio.Lock()
        self.ready = False

    def load(self) -> None:
        log.info("loading_processor", path=MODEL_PATH)
        self.processor = VibeVoiceProcessor.from_pretrained(MODEL_PATH)
        log.info("loading_model", path=MODEL_PATH, device=DEVICE)
        t0 = time.time()
        self.model = VibeVoiceForConditionalGenerationInference.from_pretrained(
            MODEL_PATH,
            torch_dtype=torch.bfloat16 if DEVICE == "cuda" else torch.float32,
            device_map=DEVICE,
            attn_implementation="sdpa",
        )
        self.model.eval()
        self.model.set_ddpm_inference_steps(num_steps=10)

        # Voice samples are raw .wav files shipped with the Hindi checkpoint.
        # They are also discovered from any extra wavs we drop in the model dir.
        for path in sorted(glob.glob(os.path.join(MODEL_PATH, "*.wav"))):
            stem = Path(path).stem.lower()
            if stem == "demo":  # the demo.wav output that ships with the model
                continue
            self.voices[stem] = path

        log.info(
            "model_loaded",
            seconds=round(time.time() - t0, 2),
            voices=list(self.voices.keys()),
        )
        self.ready = True

    def synthesize(self, text: str, voice_id: str, cfg_scale: float) -> bytes:
        key = voice_id.lower()
        if key not in self.voices:
            raise KeyError(voice_id)
        voice_path = self.voices[key]

        # Single-speaker script format expected by the full TTS model.
        script = f"Speaker 1: {text}"

        inputs = self.processor(
            text=[script],
            voice_samples=[[voice_path]],
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(DEVICE)

        with torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=cfg_scale,
                tokenizer=self.processor.tokenizer,
                generation_config={"do_sample": False},
                verbose=False,
            )

        if not outputs.speech_outputs or outputs.speech_outputs[0] is None:
            raise RuntimeError("empty audio output")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            self.processor.save_audio(outputs.speech_outputs[0], output_path=tmp)
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


app = FastAPI(title="Vaani Hindi TTS", version="0.1.0", lifespan=lifespan)
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


class SpeechRequest(BaseModel):
    input: str = Field(..., min_length=1, max_length=4000)
    voice: str = Field(default="hi-priya_woman")
    cfg_scale: float = Field(default=1.3, ge=0.5, le=3.0)


@app.get("/healthz")
def healthz():
    if not engine.ready:
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok"}


@app.get("/v1/voices")
def list_voices():
    return {
        "voices": [
            {"id": vid, "stem": Path(p).stem, "language": "hi"}
            for vid, p in sorted(engine.voices.items())
        ]
    }


@app.post("/v1/audio/speech")
async def create_speech(req: SpeechRequest):
    if not engine.ready:
        raise HTTPException(503, "model still loading")
    if req.voice.lower() not in engine.voices:
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
