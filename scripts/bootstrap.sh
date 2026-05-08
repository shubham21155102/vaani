#!/usr/bin/env bash
# One-shot fresh-server setup for Vaani. Idempotent — re-running is safe.
#
# Prereqs (do these manually before running):
#   - Ubuntu 22.04 with NVIDIA GPU + driver, CUDA toolkit
#   - Docker installed and your user in the docker group, OR sudo enabled
#   - Repo cloned to /home/ubuntu/vaani
#   - /home/ubuntu/vaani/.env populated (copy from .env.example)
#   - DNS records pointing to this box (see docs/DEPLOYMENT.md)
#   - Cloud SG opened: TCP 22/80/443/7881, UDP 7882, UDP 50000-60000
#
# Usage:
#   bash scripts/bootstrap.sh
set -euo pipefail

ROOT=/home/ubuntu/vaani
cd "$ROOT"

GREEN=$'\e[32m'
YELLOW=$'\e[33m'
RED=$'\e[31m'
RESET=$'\e[0m'

step() { echo; echo "▶ $*"; }
ok()   { echo "  ${GREEN}✓${RESET} $*"; }
skip() { echo "  ${YELLOW}↷${RESET} $* (already done)"; }

# ----------------------------------------------------------------------
step "1. system packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  python3 python3-venv python3-pip \
  git curl ca-certificates gnupg \
  libsndfile1 libsndfile1-dev ffmpeg \
  debian-keyring debian-archive-keyring apt-transport-https
ok "apt deps installed"

# Caddy (official repo)
if ! command -v caddy >/dev/null 2>&1; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
  ok "caddy installed"
else
  skip "caddy"
fi

# Docker
command -v docker >/dev/null 2>&1 || {
  echo "${RED}docker missing — install via sudo apt install docker.io and re-run${RESET}"
  exit 1
}
ok "docker available"

# .env present?
test -s "$ROOT/.env" || {
  echo "${RED}/home/ubuntu/vaani/.env is empty or missing — copy from .env.example, fill it, then re-run${RESET}"
  exit 1
}
chmod 600 "$ROOT/.env"
ok ".env protected (chmod 600)"

# ----------------------------------------------------------------------
step "2. external repos"
mkdir -p "$ROOT/external"
cd "$ROOT/external"
[ -d VibeVoice ] || git clone --depth 1 https://github.com/microsoft/VibeVoice.git
[ -d VibeVoice-community ] || git clone --depth 1 https://github.com/vibevoice-community/VibeVoice.git VibeVoice-community
ok "VibeVoice + community fork cloned"

# ----------------------------------------------------------------------
step "3. Python venvs"
make_venv() {
  local path="$1"; shift
  if [ ! -d "$path" ]; then
    python3 -m venv "$path"
    "$path/bin/pip" install --quiet --upgrade pip wheel setuptools
    ok "created $path"
  else
    skip "$path"
  fi
}

make_venv "$ROOT/.venv"
make_venv "$ROOT/.venv-stt"
make_venv "$ROOT/.venv-tts-hi"
make_venv "$ROOT/.venv-agent"

# ----------------------------------------------------------------------
step "4. main venv (TTS streaming + API + auth + billing + agent token)"
"$ROOT/.venv/bin/pip" install --quiet \
  -e "$ROOT/external/VibeVoice[streamingtts]"
"$ROOT/.venv/bin/pip" install --quiet \
  "fastapi==0.115.6" "uvicorn[standard]==0.34.0" "pydantic==2.10.4" \
  "python-multipart==0.0.20" "structlog==24.4.0" \
  "pyjwt==2.10.1" "bcrypt==4.2.1" "google-auth==2.36.0" \
  "email-validator==2.2.0" "soundfile==0.13.0" "librosa==0.10.2.post1" \
  "livekit-api>=1.0.5" "transformers==4.57.0"
ok "main venv ready"

# ----------------------------------------------------------------------
step "5. STT venv (transformers 5.8 native VibeVoiceAsr)"
"$ROOT/.venv-stt/bin/pip" install --quiet \
  "torch==2.7.0" "transformers==5.8.0" "fastapi==0.115.6" \
  "uvicorn[standard]==0.34.0" "structlog==24.4.0" "soundfile==0.13.0" \
  "librosa==0.10.2.post1" "numpy<2" "av" "python-multipart==0.0.20"
ok "STT venv ready"

# ----------------------------------------------------------------------
step "6. Hindi TTS venv (community VibeVoice fork)"
"$ROOT/.venv-tts-hi/bin/pip" install --quiet \
  -e "$ROOT/external/VibeVoice-community"
"$ROOT/.venv-tts-hi/bin/pip" install --quiet \
  "fastapi==0.115.6" "uvicorn[standard]==0.34.0" "structlog==24.4.0"
ok "Hindi TTS venv ready"

# ----------------------------------------------------------------------
step "7. agent venv (livekit-agents + Groq)"
"$ROOT/.venv-agent/bin/pip" install --quiet \
  "livekit-agents>=1.0.0" "livekit-plugins-silero>=1.0.0" \
  "livekit-plugins-openai>=1.0.0" "livekit-plugins-turn-detector>=1.0.0" \
  "httpx" "numpy<2" "structlog"
ok "agent venv ready"

# ----------------------------------------------------------------------
step "8. model downloads (skipped if already present)"
mkdir -p "$ROOT/models"

dl_model() {
  local repo="$1"
  local dst="$2"
  if [ -f "$dst/config.json" ]; then
    skip "$repo"
    return
  fi
  echo "    pulling $repo → $dst (this takes a while)"
  "$ROOT/.venv/bin/huggingface-cli" download "$repo" --local-dir "$dst" \
    --quiet
  ok "downloaded $repo"
}

dl_model microsoft/VibeVoice-Realtime-0.5B "$ROOT/models/VibeVoice-Realtime-0.5B"
dl_model microsoft/VibeVoice-ASR-HF        "$ROOT/models/VibeVoice-ASR-HF"
dl_model tarun7r/vibevoice-hindi-1.5B      "$ROOT/models/vibevoice-hindi-1.5B"

# Pre-warm silero VAD weights for the agent worker.
"$ROOT/.venv-agent/bin/python" - <<'PY'
from livekit.plugins import silero
silero.VAD.load()
print("silero VAD weights cached")
PY

# ----------------------------------------------------------------------
step "9. LiveKit (Docker)"
mkdir -p "$ROOT/infra/livekit"
sudo docker pull livekit/livekit-server:latest >/dev/null
ok "image pulled"

# ----------------------------------------------------------------------
step "10. data dir + permissions for Caddy traversal"
mkdir -p "$ROOT/data/voices" "$ROOT/apps/studio/dist"
# Caddy runs as 'caddy' user — needs +x on the chain to reach dist.
chmod o+rx "$ROOT" "$ROOT/apps" "$ROOT/apps/studio" 2>/dev/null || true
[ -d "$ROOT/apps/studio/dist" ] && chmod -R o+rX "$ROOT/apps/studio/dist"
ok "perms set"

# ----------------------------------------------------------------------
step "11. systemd units"
for unit in vaani-api vaani-stt vaani-tts-hi vaani-agent vaani-livekit; do
  if [ -f "$ROOT/infra/systemd/$unit.service" ]; then
    sudo cp "$ROOT/infra/systemd/$unit.service" "/etc/systemd/system/$unit.service"
  fi
done
sudo systemctl daemon-reload
for unit in vaani-livekit vaani-api vaani-stt vaani-tts-hi vaani-agent; do
  sudo systemctl enable "$unit" >/dev/null 2>&1 || true
done
ok "systemd units installed + enabled"

# ----------------------------------------------------------------------
step "12. Caddy"
sudo cp "$ROOT/infra/caddy/Caddyfile" /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy >/dev/null 2>&1 || true
sudo systemctl restart caddy
ok "caddy live"

# ----------------------------------------------------------------------
step "13. boot it all"
bash "$ROOT/scripts/boom.sh"

echo
echo "${GREEN}🎙️  bootstrap complete.${RESET}"
echo "    Open https://vaani.shubhamiitbhu.in/ — the SPA should load."
echo "    Don't forget:"
echo "      • register the Cashfree webhook URL in dashboard"
echo "      • add https://vaani.shubhamiitbhu.in to Google OAuth allowed origins"
echo "      • point GitHub Actions at this box (DEPLOY_HOST/USER/SSH_KEY secrets)"
