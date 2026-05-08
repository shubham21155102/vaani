"""LiveKit Agents STT + TTS plugins backed by our own Vaani services.

VaaniSTT  — POSTs the user's utterance to /v1/audio/transcriptions on
            127.0.0.1:8002 (the VibeVoice-ASR-7B worker).
VaaniTTS  — POSTs the agent's reply to /v1/audio/speech on 127.0.0.1:8001
            and emits the resulting WAV as PCM frames.

Both run inside the agent worker process, so they hit the local services
over loopback (no Caddy roundtrip, no auth needed).
"""
from __future__ import annotations

import io
import uuid
import wave
from typing import Optional

import httpx
import structlog
from livekit import rtc
from livekit.agents import APIConnectOptions, stt, tts
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.agents.utils import AudioBuffer

log = structlog.get_logger()

TTS_URL = "http://127.0.0.1:8001/v1/audio/speech"
STT_URL = "http://127.0.0.1:8002/v1/audio/transcriptions"


def _audio_buffer_to_wav(buffer: AudioBuffer) -> bytes:
    """Concatenate AudioBuffer (frame or list of frames) into a single WAV blob."""
    if isinstance(buffer, list):
        frames = buffer
    else:
        frames = [buffer]
    if not frames:
        return b""

    sample_rate = frames[0].sample_rate
    num_channels = frames[0].num_channels
    pcm = b"".join(bytes(f.data) for f in frames)

    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setnchannels(num_channels)
        wf.setsampwidth(2)  # int16
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return out.getvalue()


# --- STT --------------------------------------------------------------------

class VaaniSTT(stt.STT):
    def __init__(self, url: str = STT_URL, timeout: float = 120.0) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False),
        )
        self._url = url
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        wav = _audio_buffer_to_wav(buffer)
        if not wav:
            return stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[stt.SpeechData(language="en", text="")],
            )

        try:
            r = await self._client.post(
                self._url,
                files={"file": ("input.wav", wav, "audio/wav")},
                timeout=self._timeout,
            )
            r.raise_for_status()
            data = r.json()
            text = (data.get("text") or "").strip()
        except Exception as e:
            log.warning("vaani_stt_error", error=str(e))
            text = ""

        lang = language if isinstance(language, str) else "en"
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language=lang, text=text)],
        )

    async def aclose(self) -> None:  # type: ignore[override]
        await self._client.aclose()


# --- TTS --------------------------------------------------------------------

class VaaniTTS(tts.TTS):
    """Non-streaming TTS — fetches the whole WAV, pushes it in 200ms PCM frames."""

    SAMPLE_RATE = 24000
    NUM_CHANNELS = 1

    def __init__(
        self,
        voice: str = "en-emma_woman",
        url: str = TTS_URL,
        timeout: float = 120.0,
    ) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=self.SAMPLE_RATE,
            num_channels=self.NUM_CHANNELS,
        )
        self._voice = voice
        self._url = url
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)

    def synthesize(
        self,
        text: str,
        *,
        conn_options: Optional[APIConnectOptions] = None,
    ) -> "tts.ChunkedStream":
        return _VaaniSynth(
            tts=self,
            input_text=text,
            conn_options=conn_options or APIConnectOptions(),
        )

    async def aclose(self) -> None:  # type: ignore[override]
        await self._client.aclose()


class _VaaniSynth(tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts: VaaniTTS,
        input_text: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._vtts = tts
        # livekit-agents 1.5 doesn't auto-populate _request_id on ChunkedStream;
        # generate one ourselves and pass to AudioEmitter.initialize().
        self._req_id = uuid.uuid4().hex

    async def _run(self, output_emitter: "tts.AudioEmitter") -> None:
        text = self._input_text
        if not text.strip():
            return

        try:
            r = await self._vtts._client.post(
                self._vtts._url,
                json={"input": text, "voice": self._vtts._voice},
                timeout=self._vtts._timeout,
            )
            r.raise_for_status()
            wav_bytes = r.content
        except Exception as e:
            log.warning("vaani_tts_error", error=str(e))
            return

        # Decode WAV → raw int16 PCM at the model's sample rate.
        try:
            with wave.open(io.BytesIO(wav_bytes)) as wf:
                sample_rate = wf.getframerate()
                num_channels = wf.getnchannels()
                pcm = wf.readframes(wf.getnframes())
        except Exception as e:
            log.warning("vaani_tts_wav_decode_failed", error=str(e))
            return

        output_emitter.initialize(
            request_id=self._req_id,
            sample_rate=sample_rate,
            num_channels=num_channels,
            mime_type="audio/pcm",
            frame_size_ms=200,
        )
        # Push in 200ms chunks (matches frame_size_ms above).
        bytes_per_sample = 2 * num_channels
        chunk_bytes = (sample_rate // 5) * bytes_per_sample  # 200ms
        for i in range(0, len(pcm), chunk_bytes):
            output_emitter.push(pcm[i : i + chunk_bytes])
        output_emitter.flush()
