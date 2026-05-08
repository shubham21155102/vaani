#!/usr/bin/env bash
# Boot or restart every Vaani service in the right order, then wait for
# healthchecks. Run after every reboot or whenever you want a clean state.
#
#   bash scripts/boom.sh
set -euo pipefail

cd /home/ubuntu/vaani

GREEN=$'\e[32m'
YELLOW=$'\e[33m'
RED=$'\e[31m'
RESET=$'\e[0m'

services=(vaani-livekit vaani-api vaani-stt vaani-tts-hi vaani-agent)

echo "🎙️  Vaani · booting all services"
echo

# 1. systemd: restart in dependency order so workers find the API ready.
for svc in "${services[@]}"; do
  printf "  → restarting %-20s ... " "$svc"
  if sudo systemctl restart "$svc" 2>/dev/null; then
    echo "${GREEN}ok${RESET}"
  else
    echo "${RED}failed${RESET}"
    echo "      see: sudo journalctl -u $svc -n 30"
    exit 1
  fi
done

# 2. Caddy: validate then reload (no full restart unless config invalid).
printf "  → validating Caddyfile         ... "
if sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo "${GREEN}ok${RESET}"
  printf "  → reloading caddy              ... "
  sudo systemctl reload caddy && echo "${GREEN}ok${RESET}" || echo "${RED}failed${RESET}"
else
  echo "${RED}invalid${RESET}"
  echo "      run: sudo caddy validate --config /etc/caddy/Caddyfile"
  exit 1
fi

echo

# 3. Wait for HTTP healthchecks.
declare -A checks=(
  ["main API     :8001"]="http://127.0.0.1:8001/healthz"
  ["STT worker   :8002"]="http://127.0.0.1:8002/healthz"
  ["Hindi TTS    :8003"]="http://127.0.0.1:8003/healthz"
  ["LiveKit      :7880"]="http://127.0.0.1:7880/"
)

for label in "main API     :8001" "STT worker   :8002" "Hindi TTS    :8003" "LiveKit      :7880"; do
  url="${checks[$label]}"
  printf "  ⏳ %s ... " "$label"
  ok=0
  for i in $(seq 1 60); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      printf "${GREEN}up${RESET} (%ds)\n" "$((i*2))"
      ok=1
      break
    fi
    sleep 2
  done
  if [ "$ok" -ne 1 ]; then
    printf "${RED}timeout${RESET}\n"
    echo "      see: sudo journalctl -u ${label##*: } -n 30"
    exit 1
  fi
done

echo
echo "  📡 public smoke tests"
for u in https://vaani.shubhamiitbhu.in/ \
         https://vaani-api.shubhamiitbhu.in/api/info \
         https://livekit.shubhamiitbhu.in/; do
  printf "    %s ... " "$u"
  code=$(curl -o /dev/null -s -w "%{http_code}" -m 5 "$u" || true)
  if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "308" ]; then
    echo "${GREEN}$code${RESET}"
  else
    echo "${YELLOW}$code${RESET}"
  fi
done

echo
echo "${GREEN}🚀 boom — Vaani is live.${RESET}"
echo "    Studio  : https://vaani.shubhamiitbhu.in/"
echo "    API     : https://vaani-api.shubhamiitbhu.in/api/info"
echo "    LiveKit : wss://livekit.shubhamiitbhu.in"
