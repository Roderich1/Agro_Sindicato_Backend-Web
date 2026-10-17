#!/usr/bin/env bash
# F07-WEB-01 (#23): recorrido de la Web compilada (vite preview) contra el
# Backend compilado, con una base nueva en agro_b_web_pg y el dataset D4
# (Back/scripts/f07-synthetic-seed.cjs). Requiere Back/dist y Web/dist
# compilados y puppeteer-core instalado en tool/f10_eval_web.
#   bash tool/f07_web_01/run-walk.sh <salida>
# Las credenciales se generan en el proceso y no se escriben en ningún archivo.
set -euo pipefail
mkdir -p "${1:?salida}"
OUT=$(cd "$1" && pwd -W)
ROOT=$(cd "$(dirname "$0")/../.." && pwd -W)
clean() { tr -d '\r\n'; }
export API_URL=http://localhost:3124 WEB_URL=http://localhost:4177
for port in 3124 4177; do
  if netstat -ano | grep -qE ":$port .*LISTEN"; then echo "puerto $port ocupado"; exit 1; fi
done
DB=f07web01_$(date -u +%Y%m%d_%H%M%S)
docker exec agro_b_web_pg createdb -U agro "$DB"
export DATABASE_URL=postgresql://agro@127.0.0.1:55442/$DB
export JWT_SECRET=$(openssl rand -hex 32 | clean)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
export SYNC_V1_FINGERPRINT_KEY_VERSION=1
export WALK_PASSWORD=$(openssl rand -hex 16 | clean)
{
  echo "start=$(date -u +%FT%TZ)"
  echo "db=$DB"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "web_flag_VITE_LEGACY_FARMER_WEB=${VITE_LEGACY_FARMER_WEB:-(sin definir: transición aplicada)}"
  echo "node=$(node --version)"
} > "$OUT/env.txt"
(cd "$ROOT/Back" && npx prisma migrate deploy > "$OUT/migrate.log" 2>&1)
(cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=3124 CORS_ORIGIN=$WEB_URL COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic \
  exec node dist/main.js > "$OUT/api.log" 2>&1) &
API_PID=$!
(cd "$ROOT/Web" && VITE_API_PROXY_TARGET=$API_URL exec npx vite preview --port 4177 --strictPort > "$OUT/web.log" 2>&1) &
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
(cd "$ROOT/Back" && F07_SYNTHETIC_SEED=yes node scripts/f07-synthetic-seed.cjs) > "$OUT/seed.json"
CAMPAIGN_ID=$(node -e "console.log(require(process.argv[1]).campaigns.C1)" "$OUT/seed.json")
export CAMPAIGN_ID
BROWSER_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node "$ROOT/tool/f07_web_01/walk.mjs" "$OUT" || true
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
