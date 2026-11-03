#!/usr/bin/env bash
# F12-EST-08 (#181): recorrido reproducible de «Necesidades y propuesta
# conjunta» con la estimación como referencia, contra el backend REAL y
# PostgreSQL desechable, con datos SINTÉTICOS.
#
#   PG_ADMIN_URL=<postgres desechable> BROWSER_PATH=<edge o chrome> PUPPETEER_HOME=<carpeta con puppeteer-core> \
#     bash docs/evidence/f12_est_08/recorrido.sh <salida>
#
# Desde la raíz del repositorio, con `npm ci` hecho en Back/ y Web/. Compila
# ambos, siembra una base nueva, arranca `node dist/main.js` (con su
# trabajador, modo provisional sintético) y `vite preview` con proxy a esa API,
# y ejecuta las fases «provisional» (Directiva) y «admin» (Administrador).
# Después reinicia el backend sin el modo provisional (política pendiente) y
# ejecuta la fase «pending». La contraseña de un solo uso, los secretos JWT y
# la clave de huella de Sync v1 viven sólo en este proceso. Nada de esto toca
# datos reales.
set -euo pipefail
OUT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
mkdir -p "$OUT"
ROOT="$(pwd)"
API_PORT="${API_PORT:-3392}"
WEB_PORT="${WEB_PORT:-5392}"
export WALK_PASSWORD="$(openssl rand -hex 18)"
export JWT_SECRET="$(openssl rand -hex 24)" JWT_REFRESH_SECRET="$(openssl rand -hex 24)"
export SYNC_V1_FINGERPRINT_KEY="$(openssl rand -base64 32 | tr -d '\r\n')" SYNC_V1_FINGERPRINT_KEY_VERSION=1
export IDS="$OUT/ids.json" BACK_DIR="$ROOT/Back" WEB_URL="http://127.0.0.1:$WEB_PORT" API_URL="http://127.0.0.1:$API_PORT"
pids=()
cleanup() {
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  for port in "$API_PORT" "$WEB_PORT"; do
    for pid in $(netstat -ano | grep -E ":$port .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F > /dev/null 2>&1 || true; done
  done
}
trap cleanup EXIT

{
  echo "start=$(date -u +%FT%TZ)"
  echo "head=$(git rev-parse HEAD)"
  echo "status=$(git status --short | tr '\n' ';')"
  echo "node=$(node -v)"
  echo "postgres=$(docker exec agro_f12_est08_pg postgres --version 2>/dev/null | awk '{print $3}')"
  echo "puppeteer_core=$(node -p "require(require('node:path').join(process.env.PUPPETEER_HOME, 'node_modules/puppeteer-core/package.json')).version")"
} > "$OUT/version.txt"

(cd Back && rm -f tsconfig.build.tsbuildinfo && npm run build > "$OUT/build-back.log" 2>&1)
(cd Web && npm run build > "$OUT/build-web.log" 2>&1)
(cd Back && node ../docs/evidence/f12_est_08/control-sintetico.cjs seed "$IDS")
DB_URL="$(node -e "const u=new URL(process.env.PG_ADMIN_URL);u.pathname='/'+require(process.env.IDS).database;process.stdout.write(u.toString())")"

start_api() {
  local mode="$1" log="$2"
  (cd Back && exec env DATABASE_URL="$DB_URL" PORT="$API_PORT" NODE_ENV=development COOKIE_SECURE=false CORS_ORIGIN="$WEB_URL" \
    ESTIMATION_WORKER_INTERVAL_MS=1000 COLLECTIVE_SEALING=enabled \
    ${mode:+COLLECTIVE_DISCLOSURE_MODE=$mode} node dist/main.js > "$log" 2>&1) &
  API_PID=$!
  pids+=("$API_PID")
  for _ in $(seq 1 60); do curl -sf "$API_URL/api/v1/health" > /dev/null && return 0; sleep 1; done
  echo "la API no arrancó" >&2; return 1
}

start_api provisional-synthetic "$OUT/api-provisional.log"
(cd Web && VITE_API_PROXY_TARGET="$API_URL" exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort > "$OUT/web-preview.log" 2>&1) &
pids+=("$!")
for _ in $(seq 1 60); do curl -sf "$WEB_URL/login" > /dev/null && break; sleep 1; done

status=0
node docs/evidence/f12_est_08/recorrido-web.mjs provisional "$OUT" || status=1
node docs/evidence/f12_est_08/recorrido-web.mjs admin "$OUT" || status=1
kill "$API_PID" 2>/dev/null || true
for pid in $(netstat -ano | grep -E ":$API_PORT .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F > /dev/null 2>&1 || true; done
sleep 2
start_api "" "$OUT/api-pending.log"
node docs/evidence/f12_est_08/recorrido-web.mjs pending "$OUT" || status=1
# Sólo las líneas del trabajador quedan como registro del proceso; los registros completos no se publican.
grep -h -E '\[(F12 WORKER|F12 SERIES|JOINT PROPOSAL)\]' "$OUT"/api-*.log | sed -E 's/\x1b\[[0-9;]*m//g' > "$OUT/worker-log.txt" || true
echo "end=$(date -u +%FT%TZ)" >> "$OUT/version.txt"
exit "$status"
