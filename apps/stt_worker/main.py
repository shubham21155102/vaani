"""Vaani STT worker — VibeVoice-ASR-7B on its own venv.

Runs on 127.0.0.1:8002 in a separate Python process from the TTS API
because the transformers version that ships VibeVoice ASR (5.x) is
incompatible with the vibevoice pip package the streaming TTS still
needs (transformers 4.57). Caddy path-routes /v1/audio/transcriptions*
here; everything else hits the TTS API on 8001.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import time
from contextlib import asynccontextmanager

import librosa
import numpy as np
import soundfile as sf
import structlog
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from transformers import (  # type: ignore[import-not-found]
    VibeVoiceAsrForConditionalGeneration,
    VibeVoiceAsrProcessor,
)

logging.getLogger("transformers").setLevel(logging.ERROR)
log = structlog.get_logger()

MODEL_PATH = os.environ.get(
    "VAANI_ASR_MODEL", "/home/ubuntu/vaani/models/VibeVoice-ASR-HF"
)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MAX_AUDIO_BYTES = 200 * 1024 * 1024  # 200 MB hard cap


class Engine:
    def __init__(self) -> None:
        self.processor = None
        self.model = None
        self.lock = asyncio.Lock()
        self.ready = False
        self.sample_rate = 16000

    def load(self) -> None:
        log.info("loading_asr_processor", path=MODEL_PATH)
        self.processor = VibeVoiceAsrProcessor.from_pretrained(MODEL_PATH)
        fe = getattr(self.processor, "feature_extractor", None)
        if fe is not None and hasattr(fe, "sampling_rate"):
            self.sample_rate = fe.sampling_rate
        log.info(
            "loading_asr_model",
            path=MODEL_PATH,
            device=DEVICE,
            sr=self.sample_rate,
        )
        t0 = time.time()
        self.model = VibeVoiceAsrForConditionalGeneration.from_pretrained(
            MODEL_PATH,
            dtype=torch.bfloat16 if DEVICE == "cuda" else torch.float32,
            device_map=DEVICE,
            attn_implementation="eager",
        )
        self.model.eval()
        log.info("asr_model_loaded", seconds=round(time.time() - t0, 2))
        self.ready = True

    def transcribe(self, audio: np.ndarray) -> str:
        # VibeVoice ASR is a chat-style audio-LLM. Build the multimodal
        # prompt via the model's chat template, then run inference and
        # decode only the newly generated tokens.
        messages = [{"role": "user", "content": [{"type": "audio"}]}]
        prompt = self.processor.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )
        inputs = self.processor(
            text=prompt,
            audio=audio,
            return_tensors="pt",
        )
        prompt_len = inputs["input_ids"].shape[1]
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(DEVICE)

        with torch.inference_mode():
            out = self.model.generate(
                **inputs,
                max_new_tokens=4096,
                do_sample=False,
            )

        new_tokens = out[:, prompt_len:]
        decoded = self.processor.batch_decode(
            new_tokens, skip_special_tokens=True
        )
        return decoded[0].strip() if decoded else ""


engine = Engine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.load()
    yield


app = FastAPI(title="Vaani STT", version="0.1.0", lifespan=lifespan)
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


@app.get("/healthz")
def healthz():
    if not engine.ready:
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok"}


def _decode_audio(raw: bytes) -> np.ndarray:
    """Return mono float32 audio at engine.sample_rate."""
    try:
        audio, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
    except Exception:
        # mp3 / m4a / ogg fallback via librosa+audioread+ffmpeg.
        audio, sr = librosa.load(io.BytesIO(raw), sr=None, mono=True)
    if isinstance(audio, np.ndarray) and audio.ndim == 2:
        audio = audio.mean(axis=1)
    audio = audio.astype(np.float32, copy=False)
    if sr != engine.sample_rate:
        audio = librosa.resample(
            audio, orig_sr=sr, target_sr=engine.sample_rate
        )
    return audio


@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    if not engine.ready:
        raise HTTPException(503, "asr model still loading")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(413, f"file exceeds {MAX_AUDIO_BYTES // 1024 // 1024} MB cap")

    try:
        audio = await asyncio.to_thread(_decode_audio, raw)
    except Exception as e:
        raise HTTPException(400, f"could not decode audio: {e}")

    duration = len(audio) / engine.sample_rate
    t0 = time.time()
    async with engine.lock:
        text = await asyncio.to_thread(engine.transcribe, audio)
    elapsed = time.time() - t0
    log.info(
        "transcribed",
        bytes=len(raw),
        seconds=round(elapsed, 2),
        audio_seconds=round(duration, 2),
        chars=len(text),
    )
    return {
        "text": text,
        "duration": round(duration, 2),
    }
