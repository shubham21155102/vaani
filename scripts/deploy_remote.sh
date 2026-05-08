#!/usr/bin/env bash
# Run on the GH200 box by GitHub Actions after rsyncing the new code.
# Idempotent: safe to re-run.
set -euo pipefail

cd /home/ubuntu/vaani

echo "[deploy] installing systemd units"
sudo cp infra/systemd/vaani-api.service       /etc/systemd/system/vaani-api.service
sudo cp infra/systemd/vaani-stt.service       /etc/systemd/system/vaani-stt.service
sudo cp infra/systemd/vaani-tts-hi.service    /etc/systemd/system/vaani-tts-hi.service
sudo cp infra/systemd/vaani-agent.service     /etc/systemd/system/vaani-agent.service
sudo cp infra/systemd/vaani-livekit.service   /etc/systemd/system/vaani-livekit.service
sudo systemctl daemon-reload

echo "[deploy] validating + reloading Caddy"
sudo cp infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

echo "[deploy] restarting application services"
# Restart in dependency order — API first so workers can call it.
sudo systemctl restart vaani-api
sudo systemctl restart vaani-stt
sudo systemctl restart vaani-tts-hi
sudo systemctl restart vaani-agent
# LiveKit only restarts if its service unit changed; not on every deploy.
# Uncomment to force: sudo systemctl restart vaani-livekit

echo "[deploy] waiting for health"
for svc in vaani-api vaani-stt vaani-tts-hi vaani-agent; do
  if systemctl is-active --quiet "$svc"; then
    echo "  ✓ $svc"
  else
    echo "  ✗ $svc — failing"
    sudo journalctl -u "$svc" --no-pager -n 20
    exit 1
  fi
done

# Wait briefly for HTTP healthz on the gateway services
for url in http://127.0.0.1:8001/healthz http://127.0.0.1:8002/healthz http://127.0.0.1:8003/healthz; do
  for i in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "  ✓ $url"
      break
    fi
    sleep 2
    if [ "$i" -eq 30 ]; then
      echo "  ✗ $url — never came up"
      exit 1
    fi
  done
done

echo "[deploy] done"
