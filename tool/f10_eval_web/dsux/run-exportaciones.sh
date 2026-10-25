#!/usr/bin/env bash
# F10 usabilidad, DS-UX Central/Web: exportaciones nuevas de F07 (resumen CSV
# con seal_*, estado del sellado, tendencias y CSV del borrador) contra el
# oráculo, con el Backend COMPILADO y la política actual (provisional-synthetic,
# NODE_ENV=development como desviación declarada §0.4; sellado SIN activar).
# Complementa run-dsux.sh sin cambiarlo: siembra un tenant Web de
# VERIFICACIÓN propio (EXP1) en una base nueva del contenedor y ejecuta
# exportaciones.mjs.
#
#   tool/f10_eval_web/dsux/run-exportaciones.sh <salida>
#
# Secretos generados en memoria; nunca se escriben en disco ni en logs.
# Entorno: F10_UX_SESSION_DATE (OBLIGATORIA, AAAA-MM-DD y una fecha real; sin
# valor por defecto: session-date.sh), PG_CONTAINER, PG_PORT, API_PORT,
# F10_UX_LABEL (por defecto EXP1).
set -euo pipefail
. "$(dirname "$0")/session-date.sh"
require_session_date
mkdir -p "${1:?salida}"
OUT=$(cd "$1" && pwd -W)
ROOT=$(cd "$(dirname "$0")/../../.." && pwd -W)
DSUX=$ROOT/tool/f10_eval_web/dsux
clean() { tr -d '\r\n'; }
PG_CONTAINER=${PG_CONTAINER:-agro_b_f10ux_pg}
PG_PORT=${PG_PORT:-55459}
API_PORT=${API_PORT:-3138}
LABEL=${F10_UX_LABEL:-EXP1}
export F10_UX_SEED=20261018
export API_URL=http://localhost:$API_PORT
if netstat -ano | grep -qE ":$API_PORT .*LISTEN"; then echo "puerto $API_PORT ocupado"; exit 1; fi
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || { echo "falta el contenedor $PG_CONTAINER"; exit 1; }
{
  echo "start=$(date -u +%FT%TZ)"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "tool_dirty=$(git -C "$ROOT" status --porcelain -- Back/scripts/f10-dsux-central-seed.cjs tool/f10_eval_web/dsux | wc -l) archivos sin commitear"
  echo "seed=$F10_UX_SEED session_date=$F10_UX_SESSION_DATE (explícita) label=$LABEL"
  echo "pg_container=$PG_CONTAINER pg_port=$PG_PORT api_port=$API_PORT"
  echo "migrations=$(ls -d "$ROOT"/Back/prisma/migrations/*/ | wc -l)"
  echo "node_env=development; collective_disclosure_mode=provisional-synthetic; collective_sealing=sin definir (desactivado); cookie_secure=false; throttler intacto"
  echo "node=$(node --version)"
} > "$OUT/env-exportaciones.txt"

db=dsuxexp_$(date -u +%Y%m%d_%H%M%S)
docker exec "$PG_CONTAINER" createdb -U agro "$db"
export DATABASE_URL=postgresql://agro@127.0.0.1:$PG_PORT/$db
export JWT_SECRET=$(openssl rand -hex 32 | clean)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
export SYNC_V1_FINGERPRINT_KEY_VERSION=1
export F10_UX_PASSWORD=$(openssl rand -hex 16 | clean)
logs=$OUT/logs-exportaciones
mkdir -p "$logs"
echo "db=$db" >> "$OUT/env-exportaciones.txt"
(cd "$ROOT/Back" && npx prisma migrate deploy > "$logs/migrate.log" 2>&1)
(cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=$API_PORT COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic \
  exec node dist/main.js > "$logs/api.log" 2>&1) &
api_pid=$!
stop() {
  kill $api_pid 2>/dev/null || true
  for pid in $(netstat -ano | grep -E ":$API_PORT .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
}
trap stop EXIT
for _ in $(seq 1 60); do curl -sf --max-time 2 "$API_URL/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done

(cd "$ROOT/Back" && F10_UX_SYNTHETIC_SEED=yes F10_UX_TARGET=web F10_UX_LABEL=$LABEL F10_UX_MANIFEST="$OUT/manifest-$LABEL.json" \
  node scripts/f10-dsux-central-seed.cjs > /dev/null 2> "$logs/seed-$LABEL.err")
echo "seed web $LABEL ok $(date -u +%FT%TZ)" >> "$OUT/env-exportaciones.txt"
python -I -X utf8 "$DSUX/oraculo_check.py" "$DSUX/oraculo_web.json" "$OUT/manifest-$LABEL.json" > "$OUT/oraculo-$LABEL.txt" || true
status=0
node "$DSUX/exportaciones.mjs" "$OUT" "$OUT/manifest-$LABEL.json" || status=$?
grep -c 'HTTP 429' "$logs/api.log" | sed 's/^/api_429=/' >> "$OUT/env-exportaciones.txt" || true
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env-exportaciones.txt"
exit $status
