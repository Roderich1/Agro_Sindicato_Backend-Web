#!/usr/bin/env bash
# F07: recorrido de integración Web↔Backend del sellado (walk-seal.mjs) con la
# Web compilada (vite preview) y el Backend compilado, contra una base nueva en
# el contenedor desechable agro_b_f07seal_pg (127.0.0.1:55471, sólo local) y
# el dataset sintético D4 (Back/scripts/f07-synthetic-seed.cjs).
# Requiere Back/dist y Web/dist compilados desde este árbol y puppeteer-core
# instalado en tool/f10_eval_web.
#   bash tool/f07_web_seal/run-seal-walk.sh <salida>
# Las credenciales se generan en el proceso y no se escriben en ningún archivo.
# En <salida> sólo quedan env.txt, walk.json, el CSV descargado y las capturas;
# la semilla (con UUID) y los logs van a una carpeta temporal aparte, que no se
# publica. COLLECTIVE_SEALING=enabled sólo en este proceso desechable.
set -euo pipefail
mkdir -p "${1:?salida}"
OUT=$(cd "$1" && pwd -W)
ROOT=$(cd "$(dirname "$0")/../.." && pwd -W)
PRIV=$(cd "$(mktemp -d)" && pwd -W)
echo "semilla y logs (no publicar): $PRIV"
clean() { tr -d '\r\n'; }
export API_URL=http://localhost:3124 WEB_URL=http://localhost:4177
for port in 3124 4177; do
  if netstat -ano | grep -qE ":$port .*LISTEN"; then echo "puerto $port ocupado"; exit 1; fi
done
DB=f07seal_web_$(date -u +%Y%m%d_%H%M%S)
docker exec agro_b_f07seal_pg createdb -U postgres "$DB"
export DATABASE_URL=postgresql://postgres@127.0.0.1:55471/$DB
export JWT_SECRET=$(openssl rand -hex 32 | clean)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
export SYNC_V1_FINGERPRINT_KEY_VERSION=1
export WALK_PASSWORD=$(openssl rand -hex 16 | clean)
BROWSER_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"
{
  echo "start=$(date -u +%FT%TZ)"
  echo "db=$DB (agro_b_f07seal_pg, postgres $(docker exec agro_b_f07seal_pg postgres --version | awk '{print $3}'))"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "code_sha_back_web=$(git -C "$ROOT" log -1 --format=%h -- Back/src Back/prisma Web/src)"
  echo "node=$(node --version) npm=$(npm --version)"
  echo "docker=$(docker version --format '{{.Server.Version}}')"
  echo "puppeteer_core=$(node -p "require('$ROOT/tool/f10_eval_web/node_modules/puppeteer-core/package.json').version")"
  echo "env=COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic COLLECTIVE_SEALING=enabled NODE_ENV=development"
} > "$OUT/env.txt"
(cd "$ROOT/Back" && npx prisma migrate deploy > "$PRIV/migrate.log" 2>&1)
(cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=3124 CORS_ORIGIN=$WEB_URL \
  COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic COLLECTIVE_SEALING=enabled \
  exec node dist/main.js > "$PRIV/api.log" 2>&1) &
API_PID=$!
(cd "$ROOT/Web" && VITE_API_PROXY_TARGET=$API_URL exec npx vite preview --port 4177 --strictPort > "$PRIV/web.log" 2>&1) &
WEB_PID=$!
cleanup() {
  kill $API_PID $WEB_PID 2>/dev/null || true
  for port in 3124 4177; do
    for pid in $(netstat -ano | grep -E ":$port .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
  done
}
trap cleanup EXIT
for _ in $(seq 1 60); do curl -sf --max-time 2 "$API_URL/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1 && break; sleep 1; done
(cd "$ROOT/Back" && F07_SYNTHETIC_SEED=yes node scripts/f07-synthetic-seed.cjs) > "$PRIV/seed.json"
CAMPAIGN_ID=$(node -e "console.log(require(process.argv[1]).campaigns.C1)" "$PRIV/seed.json")
CAMPAIGN2_ID=$(node -e "console.log(require(process.argv[1]).campaigns.C2)" "$PRIV/seed.json")
export CAMPAIGN_ID CAMPAIGN2_ID BROWSER_PATH
status=0
node "$ROOT/tool/f07_web_seal/walk-seal.mjs" "$OUT" || status=$?
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
exit $status
