# Vaani · Deployment Guide

End-to-end setup for a fresh GPU server, plus day-to-day ops.

## 0. What you're building

```
        ┌──────────────────── Internet ──────────────────────┐
        │                          │                          │
        │  vaani.shubhamiitbhu.in  │  vaani-api.…             │  livekit.…
        │       (SPA)              │  (TTS + STT + auth)      │  (RTC signaling + media)
        ▼                          ▼                          ▼
                        Caddy (80/443, auto-HTTPS, Let's Encrypt)
                                   │
        ┌──────────────────────────┼─────────────────────────────────────┐
        │                          │                                     │
        │ vhost: vaani.…           │ vhost: vaani-api.…                  │ vhost: livekit.…
        │   → file_server          │   ┌── path /v1/audio/transcriptions │   → 127.0.0.1:7880
        │     /apps/studio/dist    │   │                                 │     (LiveKit Server,
        │                          │   ├── → 127.0.0.1:8002              │      Docker, host-net)
        │                          │   │   (STT worker, transformers 5.8)│
        │                          │   │                                 │
        │                          │   └── else                          │
        │                          │       → 127.0.0.1:8001              │
        │                          │       (main API, transformers 4.57) │
        │                          │           ├── voice hi-* /          │
        │                          │           │   user-…  → :8003       │
        │                          │           │   (community fork TTS)  │
        │                          │           ├── /v1/auth/* /v1/keys/* │
        │                          │           ├── /v1/billing/*         │
        │                          │           └── /v1/agent/token       │
        │                          │                                     │
        │                          │   Agent worker (separate proc) ─────┘
        │                          │     joins LiveKit rooms,
        │                          │     STT(Groq Whisper) + LLM(Groq Qwen3)
        │                          │     + TTS(VaaniTTS via local API)
        └──────────────────────────┴─────────────────────────────────────┘
```

**Four Python venvs** because the model packages have incompatible `transformers` pins:

| Venv | transformers | Used by |
|---|---|---|
| `~/vaani/.venv` | 4.57 | main API + streaming TTS (`vibevoice` pkg) |
| `~/vaani/.venv-stt` | 5.8 | STT worker (`VibeVoiceAsr*` native) |
| `~/vaani/.venv-tts-hi` | 4.51 | Hindi/community TTS (community vibevoice fork) |
| `~/vaani/.venv-agent` | (whatever livekit-agents wants) | LiveKit agent worker |

## 1. Hardware + OS prerequisites

- Ubuntu 22.04 (aarch64 or x86_64)
- NVIDIA GPU with 24+ GB VRAM (96 GB recommended for all models loaded simultaneously)
- 4 TB+ disk, 32 GB+ RAM
- Public IPv4 reachable on TCP 80/443 + UDP 7882, 50000-60000

Confirm:

```bash
nvidia-smi          # driver works
docker --version    # Docker installed (apt install docker.io)
nvcc --version      # CUDA toolkit (12.x)
```

## 2. DNS records

In your registrar (we use GoDaddy on `shubhamiitbhu.in`), add **A records** pointing to the box's public IP:

| Hostname | Purpose |
|---|---|
| `vaani.shubhamiitbhu.in` | Studio SPA |
| `vaani-api.shubhamiitbhu.in` | TTS / STT / auth / billing / agent token |
| `livekit.shubhamiitbhu.in` | LiveKit signaling (WebSocket; media goes to the IP directly on UDP) |

## 3. Cloud security group

Inbound rules (we use Vultr's firewall):

| Proto | Port | Source | Why |
|---|---|---|---|
| TCP | 22 | your-ip/32 | SSH (don't leave open to 0.0.0.0/0 long-term) |
| TCP | 80 | 0.0.0.0/0 | HTTP (Caddy redirects → HTTPS) |
| TCP | 443 | 0.0.0.0/0 | HTTPS (everything user-facing) |
| TCP | 7881 | 0.0.0.0/0 | LiveKit ICE/TCP fallback (optional but recommended) |
| UDP | 7882 | 0.0.0.0/0 | LiveKit STUN/UDP-mux |
| UDP | 50000-60000 | 0.0.0.0/0 | LiveKit media — **without these the agent has no audio** |

## 4. Code + secrets

```bash
cd ~
git clone https://github.com/shubham21155102/vaani.git
cd vaani

# Server-side env. NEVER commit this.
cp .env.example /home/ubuntu/vaani/.env
chmod 600 /home/ubuntu/vaani/.env
${EDITOR:-nano} /home/ubuntu/vaani/.env
```

Fill in:

```
# JWT signing — generate with:  python3 -c "import secrets; print(secrets.token_urlsafe(48))"
VAANI_JWT_SECRET=<64-char-random>

# Google OAuth (public client id is OK in chat; secret-side OAuth not used)
VAANI_GOOGLE_CLIENT_ID=...apps.googleusercontent.com

# Cashfree — get from cashfree.com dashboard
VAANI_CASHFREE_BASE=https://api.cashfree.com   # or sandbox URL
VAANI_CASHFREE_APP_ID=...
VAANI_CASHFREE_SECRET=cfsk_...
VAANI_CASHFREE_API_VERSION=2023-08-01
VAANI_PUBLIC_BASE=https://vaani.shubhamiitbhu.in

# Groq for the voice agent (LLM + Whisper STT)
VAANI_GROQ_API_KEY=gsk_...
VAANI_GROQ_LLM_MODEL=qwen/qwen3-32b
VAANI_GROQ_STT_MODEL=whisper-large-v3

# LiveKit — generate fresh:
#   APIKEY=$(python3 -c "import secrets; print('APIK'+secrets.token_urlsafe(6)[:8])")
#   SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
VAANI_LIVEKIT_URL=wss://livekit.shubhamiitbhu.in
VAANI_LIVEKIT_API_KEY=APIK...
VAANI_LIVEKIT_API_SECRET=...
```

## 5. Bootstrap (first time)

```bash
bash scripts/bootstrap.sh
```

This is idempotent — re-running is safe. It will:

1. Install system packages (Caddy, libsndfile, ffmpeg, …)
2. Build the four Python venvs and install deps
3. Clone Microsoft VibeVoice + the community fork into `external/`
4. Download all three models (~20 GB total) via `huggingface-cli`
5. Pull `livekit/livekit-server:latest`
6. Install systemd units + LiveKit config
7. Install the Caddyfile
8. `daemon-reload` + start everything
9. Smoke-test public endpoints

If it fails partway, fix the cause and re-run — finished steps short-circuit.

## 6. Boot/restart everything (day-to-day)

```bash
bash scripts/boom.sh
```

Stops nothing destructive, just `systemctl restart` on every service in the right order and waits for healthchecks. ~30 s end-to-end.

## 7. Logs

```bash
sudo journalctl -u vaani-api -f         # main API
sudo journalctl -u vaani-stt -f         # STT worker
sudo journalctl -u vaani-tts-hi -f      # Hindi TTS / community fork
sudo journalctl -u vaani-agent -f       # voice agent
sudo journalctl -u caddy -f             # ingress
sudo docker logs -f vaani-livekit       # LiveKit
```

## 8. CI/CD

`.github/workflows/deploy.yml` triggers on push to `main`:

- builds the SPA with `bun run build`
- rsyncs `apps/`, `infra/`, `scripts/`, `dist/` to `/home/ubuntu/vaani/`
- runs `scripts/deploy_remote.sh` over SSH
- smoke-tests the public endpoints

Required GitHub repo secrets:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | server's public IP |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | private half of an ed25519 deploy key whose pub side is in `~/.ssh/authorized_keys` on the server |

## 9. Cashfree webhook registration

The Cashfree dashboard needs the webhook URL:

```
https://vaani-api.shubhamiitbhu.in/v1/billing/webhook
```

Without this, payments succeed at Cashfree but our DB never marks them PAID and no credits are granted. Webhook signature is HMAC-SHA256 of `timestamp + raw_body` using `XClientSecret`.

## 10. Google OAuth

In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 client:

- Authorized JavaScript origins: `https://vaani.shubhamiitbhu.in`
- Authorized redirect URIs: `https://vaani.shubhamiitbhu.in` (origin only — GIS uses `postMessage`)

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/agent` connects but no audio either way | UDP 50000-60000 closed | Open in cloud SG (step 3) |
| `dtls timeout: read/write timeout` in LiveKit logs | Same — UDP unreachable | Same |
| TTS for `user-*` voices returns 401 | Not authenticated on the speech call | Use `/v1/agent/token` (resolves voice to absolute path) or send `Authorization: Bearer …` |
| WebGPU toggle disabled in `/agent` | Browser doesn't expose `navigator.gpu` | Chrome 113+ / Edge / Safari 18+ |
| Cashfree returns 401 on `/pg/orders` | Wrong env (sandbox key against prod URL or vice-versa) | Match `VAANI_CASHFREE_BASE` to the key tier |
| Agent never speaks but logs show `mediaTrack published` | Browser autoplay blocked | The hidden `<audio>` is set to `autoPlay`; user interaction (the Start-call click) usually suffices, but click ▶ on the now-visible player to be sure |
| `_request_id` AttributeError in agent worker | livekit-agents 1.5+ doesn't auto-set it | Already fixed in `apps/agent/vaani_plugins.py` (we generate one ourselves) |
| First TTS request after boot takes 60-70s | Per-shape kernel JIT in VibeVoice TTS on SDPA | Workaround: warm up at boot. Real fix: build flash-attn-2 from source for ARM/Hopper |

## 12. Useful one-liners

```bash
# How much VRAM is loaded?
nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader

# Confirm all 4 services are active
for s in vaani-api vaani-stt vaani-tts-hi vaani-agent vaani-livekit caddy; do
  echo "$s: $(systemctl is-active $s)"
done

# What's listening?
sudo ss -tlnp | grep -E ":(80|443|7880|7881|8001|8002|8003)\b"

# Generate a JWT secret
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# Generate LiveKit key/secret pair
python3 -c "import secrets; k='APIK'+secrets.token_urlsafe(6)[:8]; s=secrets.token_urlsafe(32); print(f'{k}: {s}')"
```
