#!/usr/bin/env bash
set -euo pipefail

image="${1:-warmsip-service:beta3}"
name="warmsip-smoke-$$"
token="warmsip-ci-access-token-1234"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm -d \
  --name "$name" \
  -p 127.0.0.1:8787:8787 \
  -e HOST=0.0.0.0 \
  -e SERVICE_ACCESS_TOKEN="$token" \
  -e "ALLOWED_ORIGINS=http://localhost:1420" \
  -e ALLOW_LOCAL_AI_ENDPOINTS=false \
  "$image" >/dev/null

wait_for_health() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8787/healthz >/tmp/warmsip-health.json; then
      return 0
    fi
    sleep 1
  done
  docker logs "$name" >&2
  return 1
}

wait_for_health
printf 'health=%s\n' "$(cat /tmp/warmsip-health.json)"
status="$(
  curl -sS -o /tmp/warmsip-unauthorized.json \
    -w '%{http_code}' \
    http://127.0.0.1:8787/api/v1/capabilities
)"
test "$status" = "401"
printf 'unauthorized=%s\n' "$status"
curl -fsS \
  -H "Authorization: Bearer $token" \
  http://127.0.0.1:8787/api/v1/capabilities \
  >/tmp/warmsip-capabilities.json
printf 'capabilities=%s\n' "$(cat /tmp/warmsip-capabilities.json)"

docker restart "$name" >/dev/null
wait_for_health
printf 'restart_health=%s\n' "$(cat /tmp/warmsip-health.json)"
