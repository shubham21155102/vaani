# 🎙️ Vaani

**Open-stack voice AI platform — TTS, STT, and a Sarvam-style developer studio, built on open-source models.**

Live: [vaani.shubhamiitbhu.in](https://vaani.shubhamiitbhu.in) · API: [vaani-api.shubhamiitbhu.in](https://vaani-api.shubhamiitbhu.in)

---

## What's inside

| Capability | Model | License |
|---|---|---|
| Streaming TTS · 25 voices · 10 langs | [microsoft/VibeVoice-Realtime-0.5B](https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B) | MIT |
| Long-form STT · diarization · 50+ langs | [microsoft/VibeVoice-ASR-HF](https://huggingface.co/microsoft/VibeVoice-ASR) | MIT |
| Hindi TTS · zero-shot voice cloning | [tarun7r/vibevoice-hindi-1.5B](https://huggingface.co/tarun7r/vibevoice-hindi-1.5B) | MIT |

Hardware: a single **NVIDIA GH200 480GB** (96 GB HBM3, ARM aarch64).

## Architecture

```
              Caddy on :80/:443  (auto-HTTPS via Let's Encrypt)
                ├── vaani.shubhamiitbhu.in       → static SPA  (Vite + React + TS + Tailwind)
                └── vaani-api.shubhamiitbhu.in
                      ├── /v1/audio/transcriptions*  →  127.0.0.1:8002  (STT worker, transformers 5.8 venv)
                      └── everything else            →  127.0.0.1:8001  (main API, transformers 4.57 venv)
                                                        ├── voice hi-*  → POST 127.0.0.1:8003 (Hindi worker, community vibevoice fork venv)
                                                        ├── voice user-*→ POST 127.0.0.1:8003 with absolute path of stored wav
                                                        └── else        → local VibeVoice-Realtime-0.5B
```

The main API also serves `/v1/auth/*`, `/v1/keys/*`, `/v1/voices`, `/v1/voices/upload`, `/v1/audio/speech`, and `/api/info`.

**Three Python venvs** are required because of irreconcilable transformers version constraints:

| venv | Path | transformers | Why |
|---|---|---|---|
| TTS streaming | `~/vaani/.venv` | 4.57 | `vibevoice` pip pkg pins `<5.0` |
| STT | `~/vaani/.venv-stt` | 5.8 | VibeVoice-ASR ships only in 5.x |
| Hindi TTS + cloning | `~/vaani/.venv-tts-hi` | 4.51 | community vibevoice fork has the full multi-speaker TTS code Microsoft pulled |

## Repo layout

```
vaani/
├── apps/
│   ├── api/                  # FastAPI gateway (TTS + auth)
│   │   ├── main.py
│   │   └── auth.py           # SQLite + JWT + Google ID-token verify
│   ├── stt_worker/           # FastAPI STT worker (VibeVoice-ASR)
│   │   └── main.py
│   ├── tts_worker/           # smoke tests for the streaming model
│   └── studio/               # Vite + React + TS + Tailwind SPA
│       ├── src/
│       │   ├── pages/        # Home, TTS, STT, Voices, Login, Signup, Keys, Usage, Docs
│       │   ├── components/   # Sidebar, StatusPill, UserMenu
│       │   └── lib/          # api.ts, auth.tsx (AuthContext + GIS)
│       └── package.json
├── infra/
│   ├── caddy/Caddyfile       # two vhosts, path-routing for STT
│   └── systemd/              # vaani-api.service, vaani-stt.service
└── .env.example              # server-side secrets template
```

## API

OpenAI-shape JSON. All examples use the public host.

### TTS

```bash
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"input":"Hello from Vaani.","voice":"en-emma_woman"}' \
  --output out.wav
```

List voices:

```bash
curl https://vaani-api.shubhamiitbhu.in/v1/voices
```

### STT

```bash
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/audio/transcriptions \
  -F "file=@input.wav"
# → {"text": "...", "segments": [{"start":0,"end":8.67,"speaker":0,"text":"..."}], "duration": 6.5}
```

### Voice cloning

```bash
# Upload a 3–30s reference .wav
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/voices/upload \
  -H "Authorization: Bearer <jwt-or-vsk_live_*>" \
  -F "name=my-voice" \
  -F "file=@reference.wav"
# → {"id": "user42-my-voice", ...}

# Use it
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/audio/speech \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"input":"Hello in my own voice.","voice":"user42-my-voice"}' \
  --output cloned.wav
```

### API keys

```bash
# Issue a key (web session JWT required)
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/keys \
  -H "Authorization: Bearer <jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"production-server"}'
# → {"id":1,"name":"production-server","key":"vsk_live_...","display":"vsk_live_abc…wxyz"}

# Then use the key as a Bearer token like any other
curl -H "Authorization: Bearer vsk_live_..." https://vaani-api.shubhamiitbhu.in/v1/auth/me
```

### Auth

```bash
# Email + password
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8-chars","display_name":"You"}'

# Google (browser-side, via @google/identity-services button)
curl -X POST https://vaani-api.shubhamiitbhu.in/v1/auth/google \
  -H 'Content-Type: application/json' \
  -d '{"credential":"<google-id-token>"}'

# Authed call
curl https://vaani-api.shubhamiitbhu.in/v1/auth/me \
  -H 'Authorization: Bearer <jwt>'
```

## Local development

### SPA (Vite)

```bash
cd apps/studio
cp .env.example .env             # fill in VITE_GOOGLE_CLIENT_ID
bun install                      # or pnpm / npm
bun run dev                      # http://localhost:5173
```

### Backend

The two venvs need to be created separately on the deploy host. On the GH200 box:

```bash
# TTS venv (transformers 4.57, vibevoice pkg)
python3 -m venv ~/vaani/.venv
source ~/vaani/.venv/bin/activate
pip install -e external/VibeVoice[streamingtts]
pip install fastapi uvicorn[standard] structlog pyjwt bcrypt google-auth email-validator soundfile librosa

# STT venv (transformers 5.8 only — no vibevoice pkg)
python3 -m venv ~/vaani/.venv-stt
source ~/vaani/.venv-stt/bin/activate
pip install torch transformers==5.8.0 fastapi uvicorn[standard] structlog soundfile librosa
```

Then create `.env` (copy `.env.example` and run `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'` for the JWT secret), install the systemd units in `infra/systemd/`, and the Caddyfile in `infra/caddy/`.

## Status & known issues

| | |
|---|---|
| English TTS | ✅ Live · sub-realtime (RTF ≈ 1.2× on SDPA fallback). |
| Hindi TTS | ✅ Live · vibevoice-hindi-1.5B on a 3rd worker, transparently proxied for `hi-*` voice IDs. |
| Voice cloning | ✅ Live · upload a .wav, get a `user{id}-{slug}` voice ID, use it like any preset. Reuses the Hindi worker (zero-shot). |
| STT | ✅ Live · RTF 0.19× (5× faster than realtime). Returns text + speaker-labeled segments with timestamps. |
| Auth | ✅ Live · email/password + Google OAuth. SQLite. |
| API keys | ✅ Live · `vsk_live_*` bearer tokens, last_used tracking. Frontend management page. |
| Studio SPA | ✅ Live · TTS / STT / Voices / Keys / Login / Signup. |
| Billing / Razorpay | ⏳ Placeholder UI. |
| Perf — shape-dependent slowdown | 🐛 Each new voice-id × audio-length shape pays a ~70 s first-hit cost (CUDA kernel JIT on SDPA fallback). Subsequent matched-shape requests are fast. Real fix: build flash-attn-2 from source for ARM/Hopper. |

## Acknowledgements

Built on the work of:

- **Microsoft VibeVoice** team — open-source frontier voice AI
- **Hugging Face transformers** — model integration
- **Caddy**, **FastAPI**, **Vite**, **React**, **Tailwind**

Disclose AI-generated audio when you share it. Voice impersonation without consent is prohibited under VibeVoice's usage guidelines.

## License

Source code: MIT.
Model weights are MIT-licensed by their respective authors (see links in the table above).
