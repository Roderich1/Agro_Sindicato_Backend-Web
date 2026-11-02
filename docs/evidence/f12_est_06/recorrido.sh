#!/usr/bin/env bash
# F12-EST-06 (#179): recorrido reproducible de la pantalla Web de estimación
# contra el backend REAL y PostgreSQL desechable, con datos SINTÉTICOS.
#
#   PG_ADMIN_URL=<postgres desechable> BROWSER_PATH=<edge o chrome> PUPPETEER_HOME=<carpeta con puppeteer-core> \
#     bash docs/evidence/f12_est_06/recorrido.sh <salida>
#
# Desde la raíz del repositorio, con `npm ci` hecho en Back/ y Web/. Compila
# ambos, siembra una base nueva, arranca `node dist/main.js` (con su
# trabajador, modo provisional sintético) y `vite preview` con proxy a esa API,
# y ejecuta la fase «provisional». Después reinicia el backend sin el modo
# provisional (política pendiente) y ejecuta la fase «pending».
# La contraseña de un solo uso vive sólo en este proceso; los secretos JWT son
# efímeros. Nada de esto toca datos reales.
set -euo pipefail
OUT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
mkdir -p "$OUT"
ROOT="$(pwd)"
API_PORT="${API_PORT:-3391}"
WEB_PORT="${WEB_PORT:-5391}"
export WALK_PASSWORD="$(openssl rand -base64 18)"
export JWT_SECRET="$(openssl rand -hex 24)" JWT_REFRESH_SECRET="$(openssl rand -hex 24)"
export IDS="$OUT/ids.json" BACK_DIR="$ROOT/Back" WEB_URL="http://127.0.0.1:$WEB_PORT"
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

{
  echo "head=$(git rev-parse HEAD)"
  echo "status=$(git status --short | tr '\n' ';')"
  echo "node=$(node -v)"
} > "$OUT/version.txt"

(cd Back && rm -f tsconfig.build.tsbuildinfo && npm run build > "$OUT/build-back.log" 2>&1)
(cd Web && npm run build > "$OUT/build-web.log" 2>&1)
(cd Back && node ../docs/evidence/f12_est_06/control-sintetico.cjs seed "$IDS")
DB_URL="$(node -e "const u=new URL(process.env.PG_ADMIN_URL);u.pathname='/'+require(process.env.IDS).database;process.stdout.write(u.toString())")"

start_api() {
  local mode="$1" log="$2"
  (cd Back && exec env DATABASE_URL="$DB_URL" PORT="$API_PORT" NODE_ENV=development ESTIMATION_WORKER_INTERVAL_MS=1000 \
    ${mode:+COLLECTIVE_DISCLOSURE_MODE=$mode} node dist/main.js > "$log" 2>&1) &
  API_PID=$!
  pids+=("$API_PID")
  for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$API_PORT/api/v1/health" > /dev/null && return 0; sleep 1; done
  echo "la API no arrancó" >&2; return 1
}

start_api provisional-synthetic "$OUT/api-provisional.log"
(cd Web && VITE_API_PROXY_TARGET="http://127.0.0.1:$API_PORT" exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort > "$OUT/web-preview.log" 2>&1) &
pids+=("$!")
for _ in $(seq 1 60); do curl -sf "$WEB_URL/login" > /dev/null && break; sleep 1; done

status=0
node docs/evidence/f12_est_06/recorrido-web.mjs provisional "$OUT" || status=1
kill "$API_PID" 2>/dev/null || true
sleep 2
start_api "" "$OUT/api-pending.log"
node docs/evidence/f12_est_06/recorrido-web.mjs pending "$OUT" || status=1
# Sólo las líneas del trabajador y de las series quedan como registro del proceso.
grep -h -E '\[(F12 WORKER|F12 SERIES)\]' "$OUT"/api-*.log | sed -E 's/\x1b\[[0-9;]*m//g' > "$OUT/worker.log" || true
exit "$status"
