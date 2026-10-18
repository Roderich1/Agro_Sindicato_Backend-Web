#!/usr/bin/env bash
# F10 (RNF-08): orquestador de la matriz Web B1/B2 (W1–W5) sobre el Backend y
# la Web COMPILADOS. Una base nueva por configuración (navegador × resolución),
# sembrada con el dataset D4 por la API real (Back/scripts/f07-synthetic-seed.cjs).
#
#   tool/f10_eval_web/run-compat.sh <salida>
#
# Secretos generados en memoria; nunca se escriben en disco ni en logs.
# Serie y entorno por variables (por defecto, los de la serie 1, 2026-10-17):
# PG_CONTAINER, PG_PORT, API_PORT, WEB_PORT, PROTOCOL_LABEL, CODE_MEASURED,
# BASE_REF. COMPAT_CONFIGS (p. ej. «B1-chrome:1366x768») limita la matriz a
# algunas configuraciones: sólo para el ensayo de herramienta, no para la
# matriz de aceptación.
set -euo pipefail
mkdir -p "${1:?salida}"
OUT=$(cd "$1" && pwd -W)
ROOT=$(cd "$(dirname "$0")/../.." && pwd -W)
TOOL=$ROOT/tool/f10_eval_web
clean() { tr -d '\r\n'; }
PG_CONTAINER=${PG_CONTAINER:-agro_b_f10eval_pg}
PG_PORT=${PG_PORT:-55450}
API_PORT=${API_PORT:-3122}
WEB_PORT=${WEB_PORT:-4176}
PROTOCOL_LABEL=${PROTOCOL_LABEL:-"docs/evaluation/F10_PROTOCOLOS_EVALUACION.md v1.1 @ 7581af23b417340b7f00fc7e4822dff3ee9a9aab"}
CODE_MEASURED=${CODE_MEASURED:-ed069a695eb9f8bdc318bfd16efc0071fcdced25}
BASE_REF=${BASE_REF:-$CODE_MEASURED}
COMPAT_CONFIGS=${COMPAT_CONFIGS:-"B1-chrome:1366x768 B1-chrome:1920x1080 B2-edge:1366x768 B2-edge:1920x1080"}
export API_URL=http://localhost:$API_PORT WEB_URL=http://localhost:$WEB_PORT
export ORACLE=$ROOT/Back/src/modules/collective/test-support/d4/F06_EXPECTED_CELLS.csv
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
{
  echo "start=$(date -u +%FT%TZ)"
  echo "protocol=$PROTOCOL_LABEL"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "code_measured=$CODE_MEASURED"
  echo "code_diff_vs_base=$(git -C "$ROOT" diff --stat "$BASE_REF" -- Back/src Web/src Back/prisma | wc -l) líneas de diff en Back/src, Web/src y Back/prisma"
  echo "pg_container=$PG_CONTAINER pg_port=$PG_PORT api_port=$API_PORT web_port=$WEB_PORT"
  echo "migrations=$(ls -d "$ROOT"/Back/prisma/migrations/*/ | wc -l)"
  echo "configs=$COMPAT_CONFIGS"
  echo "node_env=development; collective_disclosure_mode=provisional-synthetic; cookie_secure=false (como R5)"
  echo "chrome=$(powershell -NoProfile -Command "(Get-Item '$CHROME').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "edge=$(powershell -NoProfile -Command "(Get-Item '$EDGE').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "puppeteer_core=$(node -p "require('$TOOL/node_modules/puppeteer-core/package.json').version")"
  powershell -NoProfile -Command "\$o=Get-CimInstance Win32_OperatingSystem; 'os=' + \$o.Caption + ' ' + \$o.Version" | tr -d '\r'
} > "$OUT/env.txt"

run_config() { # etiqueta navegador ruta resolución
  local label=$1 browser=$2 viewport=$3
  for port in $API_PORT $WEB_PORT; do
    if netstat -ano | grep -qE ":$port .*LISTEN"; then echo "puerto $port ocupado"; exit 1; fi
  done
  local db=d4_$(date -u +%Y%m%d_%H%M%S)
  docker exec "$PG_CONTAINER" createdb -U agro "$db"
  export DATABASE_URL=postgresql://agro@127.0.0.1:$PG_PORT/$db
  export JWT_SECRET=$(openssl rand -hex 32 | clean)
  export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
  export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
  export SYNC_V1_FINGERPRINT_KEY_VERSION=1
  export WALK_PASSWORD=$(openssl rand -hex 16 | clean)
  local logs=$OUT/logs/$label-$viewport
  mkdir -p "$logs"
  (cd "$ROOT/Back" && npx prisma migrate deploy > "$logs/migrate.log" 2>&1)
  (cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=$API_PORT CORS_ORIGIN=$WEB_URL COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic \
    exec node dist/main.js > "$logs/api.log" 2>&1) &
  local api_pid=$!
  (cd "$ROOT/Web" && VITE_API_PROXY_TARGET=$API_URL exec npx vite preview --port "$WEB_PORT" --strictPort > "$logs/web.log" 2>&1) &
  local web_pid=$!
  for _ in $(seq 1 60); do curl -sf --max-time 2 "$API_URL/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done
  for _ in $(seq 1 60); do curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1 && break; sleep 1; done
  (cd "$ROOT/Back" && F07_SYNTHETIC_SEED=yes node scripts/f07-synthetic-seed.cjs) > "$logs/seed.json"
  echo "$label $viewport db=$db seeded=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
  BROWSER_PATH=$browser BROWSER_LABEL=$label VIEWPORT=$viewport node "$TOOL/compat.mjs" "$OUT" || true
  kill $api_pid $web_pid 2>/dev/null || true
  for port in $API_PORT $WEB_PORT; do
    for pid in $(netstat -ano | grep -E ":$port .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
  done
  sleep 5
}

for cfg in $COMPAT_CONFIGS; do
  label=${cfg%%:*}; viewport=${cfg##*:}
  case $label in
    B1-chrome) run_config "$label" "$CHROME" "$viewport" ;;
    B2-edge) run_config "$label" "$EDGE" "$viewport" ;;
    *) echo "configuración desconocida: $cfg"; exit 1 ;;
  esac
done
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
# Saneado de lo publicable (§0.9): UUID a 8 hex y sin correos, también en los
# nombres de los CSV descargados; los resultados no cambian.
node "$TOOL/sanitize.mjs" "$OUT" >> "$OUT/env.txt"
