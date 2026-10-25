#!/usr/bin/env bash
# F10 usabilidad, DS-UX Central/Web: verificación previa al piloto del
# generador (Back/scripts/f10-dsux-central-seed.cjs) contra su oráculo
# independiente, con el Backend y la Web COMPILADOS y la política actual
# (provisional-synthetic, NODE_ENV=development como desviación declarada §0.4;
# ninguna protección desactivada).
#
#   tool/f10_eval_web/dsux/run-dsux.sh <salida>
#
# En una base nueva del contenedor propio:
#   1. siembra dos tenants Web de VERIFICACIÓN (VER1, VER2) y un tenant Móvil
#      de verificación (MOVVER), y comprueba que repetir una etiqueta se niega;
#   2. comprueba el oráculo y que cada manifiesto siembra exactamente su tabla;
#   3. contrasta API y Web antes de W3, tras W3 (VER1 con canónico Bellator,
#      VER2 con canónico Belator) y tras W4.
# Los tenants de verificación quedan consumidos; los de los participantes se
# siembran aparte, con su etiqueta, el día de la sesión.
#
# Secretos generados en memoria; nunca se escriben en disco ni en logs.
# Entorno: F10_UX_SESSION_DATE (OBLIGATORIA, AAAA-MM-DD y una fecha real; sin
# valor por defecto: session-date.sh), PG_CONTAINER, PG_PORT, API_PORT,
# WEB_PORT, VIEWPORT.
set -euo pipefail
. "$(dirname "$0")/session-date.sh"
require_session_date
mkdir -p "${1:?salida}"
OUT=$(cd "$1" && pwd -W)
ROOT=$(cd "$(dirname "$0")/../../.." && pwd -W)
TOOL=$ROOT/tool/f10_eval_web
DSUX=$TOOL/dsux
clean() { tr -d '\r\n'; }
PG_CONTAINER=${PG_CONTAINER:-agro_b_f10ux_pg}
PG_PORT=${PG_PORT:-55459}
API_PORT=${API_PORT:-3138}
WEB_PORT=${WEB_PORT:-4179}
VIEWPORT=${VIEWPORT:-1366x768}
export F10_UX_SEED=20261018
export API_URL=http://localhost:$API_PORT WEB_URL=http://localhost:$WEB_PORT
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
for port in $API_PORT $WEB_PORT; do
  if netstat -ano | grep -qE ":$port .*LISTEN"; then echo "puerto $port ocupado"; exit 1; fi
done
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || { echo "falta el contenedor $PG_CONTAINER"; exit 1; }
{
  echo "start=$(date -u +%FT%TZ)"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "code_diff_vs_cab433d=$(git -C "$ROOT" diff --stat cab433d -- Back/src Web/src Back/prisma | wc -l) líneas de diff en Back/src, Web/src y Back/prisma"
  echo "generator_blob=$(git -C "$ROOT" rev-parse --verify --quiet HEAD:Back/scripts/f10-dsux-central-seed.cjs || echo sin-commit)"
  echo "oracle_blob=$(git -C "$ROOT" rev-parse --verify --quiet HEAD:tool/f10_eval_web/dsux/oraculo_web.json || echo sin-commit)"
  echo "tool_dirty=$(git -C "$ROOT" status --porcelain -- Back/scripts/f10-dsux-central-seed.cjs tool/f10_eval_web/dsux | wc -l) archivos sin commitear"
  echo "seed=$F10_UX_SEED session_date=$F10_UX_SESSION_DATE (explícita)"
  echo "pg_container=$PG_CONTAINER pg_port=$PG_PORT api_port=$API_PORT web_port=$WEB_PORT"
  echo "pg_image=$(docker inspect -f '{{.Config.Image}}' "$PG_CONTAINER")"
  echo "migrations=$(ls -d "$ROOT"/Back/prisma/migrations/*/ | wc -l)"
  echo "node_env=development; collective_disclosure_mode=provisional-synthetic; cookie_secure=false; throttler intacto"
  echo "node=$(node --version) chrome=$(powershell -NoProfile -Command "(Get-Item '$CHROME').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "puppeteer_core=$(node -p "require('$TOOL/node_modules/puppeteer-core/package.json').version")"
} > "$OUT/env.txt"

db=dsux_$(date -u +%Y%m%d_%H%M%S)
docker exec "$PG_CONTAINER" createdb -U agro "$db"
export DATABASE_URL=postgresql://agro@127.0.0.1:$PG_PORT/$db
export JWT_SECRET=$(openssl rand -hex 32 | clean)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
export SYNC_V1_FINGERPRINT_KEY_VERSION=1
export F10_UX_PASSWORD=$(openssl rand -hex 16 | clean)
logs=$OUT/logs
mkdir -p "$logs"
echo "db=$db" >> "$OUT/env.txt"
(cd "$ROOT/Back" && npx prisma migrate deploy > "$logs/migrate.log" 2>&1)
(cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=$API_PORT CORS_ORIGIN=$WEB_URL COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic \
  exec node dist/main.js > "$logs/api.log" 2>&1) &
api_pid=$!
(cd "$ROOT/Web" && VITE_API_PROXY_TARGET=$API_URL exec npx vite preview --port "$WEB_PORT" --strictPort > "$logs/web.log" 2>&1) &
web_pid=$!
stop() {
  kill $api_pid $web_pid 2>/dev/null || true
  for port in $API_PORT $WEB_PORT; do
    for pid in $(netstat -ano | grep -E ":$port .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
  done
}
trap stop EXIT
for _ in $(seq 1 60); do curl -sf --max-time 2 "$API_URL/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1 && break; sleep 1; done

seed() { # destino etiqueta
  (cd "$ROOT/Back" && F10_UX_SYNTHETIC_SEED=yes F10_UX_TARGET=$1 F10_UX_LABEL=$2 F10_UX_MANIFEST="$OUT/manifest-$2.json" \
    F10_UX_REFERENCES="$OUT/references-$2.json" node scripts/f10-dsux-central-seed.cjs > /dev/null 2> "$logs/seed-$2.err")
  echo "seed $1 $2 ok $(date -u +%FT%TZ)" >> "$OUT/env.txt"
}
seed web VER1
seed web VER2
seed movil MOVVER
# Repetir una etiqueta se niega y no escribe nada.
before=$(docker exec "$PG_CONTAINER" psql -U agro -d "$db" -tAc 'select count(*) from "User"' | clean)
if (cd "$ROOT/Back" && F10_UX_SYNTHETIC_SEED=yes F10_UX_TARGET=web F10_UX_LABEL=VER1 node scripts/f10-dsux-central-seed.cjs > /dev/null 2> "$logs/seed-VER1-repeat.err"); then
  echo "repeat_refused=NO" >> "$OUT/env.txt"
else
  after=$(docker exec "$PG_CONTAINER" psql -U agro -d "$db" -tAc 'select count(*) from "User"' | clean)
  echo "repeat_refused=yes users_before=$before users_after=$after message=$(clean < "$logs/seed-VER1-repeat.err")" >> "$OUT/env.txt"
fi

for label in VER1 VER2; do
  python -I -X utf8 "$DSUX/oraculo_check.py" "$DSUX/oraculo_web.json" "$OUT/manifest-$label.json" > "$OUT/oraculo-$label.txt" || true
done
# Cada contraste inicia tres sesiones (dos por la API y una en la Web) y
# /auth/login admite 5 por minuto: entre uno y otro se espera más de un minuto,
# sin tocar el limitador.
BROWSER_PATH=$CHROME VIEWPORT=$VIEWPORT CANONICAL=Bellator node "$DSUX/contraste.mjs" "$OUT" "$OUT/manifest-VER1.json" || true
sleep 65
BROWSER_PATH=$CHROME VIEWPORT=$VIEWPORT CANONICAL=Belator node "$DSUX/contraste.mjs" "$OUT" "$OUT/manifest-VER2.json" || true
grep -c 'HTTP 429' "$logs/api.log" | sed 's/^/api_429=/' >> "$OUT/env.txt" || true
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
