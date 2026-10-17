#!/usr/bin/env bash
# F10 (RNF-08): orquestador de la matriz Web B1/B2 (W1–W5) sobre el Backend y
# la Web COMPILADOS. Una base nueva por configuración (navegador × resolución),
# sembrada con el dataset D4 por la API real (Back/scripts/f07-synthetic-seed.cjs).
#
#   tool/f10_eval_web/run-compat.sh <salida>
#
# Secretos generados en memoria; nunca se escriben en disco ni en logs.
set -euo pipefail
mkdir -p "${1:?salida}"
OUT=$(cd "$1" && pwd -W)
ROOT=$(cd "$(dirname "$0")/../.." && pwd -W)
TOOL=$ROOT/tool/f10_eval_web
clean() { tr -d '\r\n'; }
export API_URL=http://localhost:3122 WEB_URL=http://localhost:4176
export ORACLE=$ROOT/Back/src/modules/collective/test-support/d4/F06_EXPECTED_CELLS.csv
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
{
  echo "start=$(date -u +%FT%TZ)"
  echo "protocol=docs/evaluation/F10_PROTOCOLOS_EVALUACION.md v1.1 @ 7581af23b417340b7f00fc7e4822dff3ee9a9aab"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "code_measured=ed069a695eb9f8bdc318bfd16efc0071fcdced25"
  echo "code_diff_vs_base=$(git -C "$ROOT" diff --stat ed069a6 -- Back/src Web/src Back/prisma | wc -l) líneas de diff en Back/src, Web/src y Back/prisma"
  echo "node_env=development; collective_disclosure_mode=provisional-synthetic; cookie_secure=false (como R5)"
  echo "chrome=$(powershell -NoProfile -Command "(Get-Item '$CHROME').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "edge=$(powershell -NoProfile -Command "(Get-Item '$EDGE').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "puppeteer_core=$(node -p "require('$TOOL/node_modules/puppeteer-core/package.json').version")"
  powershell -NoProfile -Command "\$o=Get-CimInstance Win32_OperatingSystem; 'os=' + \$o.Caption + ' ' + \$o.Version" | tr -d '\r'
} > "$OUT/env.txt"

run_config() { # etiqueta navegador ruta resolución
  local label=$1 browser=$2 viewport=$3
  for port in 3122 4176; do
    if netstat -ano | grep -qE ":$port .*LISTEN"; then echo "puerto $port ocupado"; exit 1; fi
  done
  local db=d4_$(date -u +%Y%m%d_%H%M%S)
  docker exec agro_b_f10eval_pg createdb -U agro "$db"
  export DATABASE_URL=postgresql://agro@127.0.0.1:55450/$db
  export JWT_SECRET=$(openssl rand -hex 32 | clean)
  export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
  export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
  export SYNC_V1_FINGERPRINT_KEY_VERSION=1
  export WALK_PASSWORD=$(openssl rand -hex 16 | clean)
  local logs=$OUT/logs/$label-$viewport
  mkdir -p "$logs"
  (cd "$ROOT/Back" && npx prisma migrate deploy > "$logs/migrate.log" 2>&1)
  (cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=3122 CORS_ORIGIN=$WEB_URL COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic \
    exec node dist/main.js > "$logs/api.log" 2>&1) &
  local api_pid=$!
  (cd "$ROOT/Web" && VITE_API_PROXY_TARGET=$API_URL exec npx vite preview --port 4176 --strictPort > "$logs/web.log" 2>&1) &
  local web_pid=$!
  for _ in $(seq 1 60); do curl -sf --max-time 2 "$API_URL/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done
  for _ in $(seq 1 60); do curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1 && break; sleep 1; done
  (cd "$ROOT/Back" && F07_SYNTHETIC_SEED=yes node scripts/f07-synthetic-seed.cjs) > "$logs/seed.json"
  echo "$label $viewport db=$db seeded=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
  BROWSER_PATH=$browser BROWSER_LABEL=$label VIEWPORT=$viewport node "$TOOL/compat.mjs" "$OUT" || true
  kill $api_pid $web_pid 2>/dev/null || true
  for port in 3122 4176; do
    for pid in $(netstat -ano | grep -E ":$port .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
  done
  sleep 5
}

run_config B1-chrome "$CHROME" 1366x768
run_config B1-chrome "$CHROME" 1920x1080
run_config B2-edge "$EDGE" 1366x768
run_config B2-edge "$EDGE" 1920x1080
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
