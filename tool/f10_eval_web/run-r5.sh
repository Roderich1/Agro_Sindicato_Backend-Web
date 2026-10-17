#!/usr/bin/env bash
# F10 (RNF-06): orquestador de R5a/R5b sobre el Backend y la Web COMPILADOS.
#
#   tool/f10_eval_web/run-r5.sh <salida> [ensayo]
#
# - Base PostgreSQL nueva en agro_b_f10eval_pg (127.0.0.1:55450), migrada y
#   sembrada con Back/scripts/f10-dsv-central-seed.cjs (DS-V Central).
# - API: node Back/dist/main.js en 3122. Web: vite preview de Web/dist en 4176,
#   con el proxy /api hacia la API (preview.proxy hereda server.proxy).
# - Secretos generados en memoria; nunca se escriben en disco ni en logs.
# - Con el segundo argumento «ensayo» sólo hace 2 repeticiones (ensayo de
#   herramienta, fuera de las series de aceptación).
set -euo pipefail
OUT=${1:?salida}
TRIAL=${2:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd -W)
TOOL=$ROOT/tool/f10_eval_web
mkdir -p "$OUT"
LOGS=$OUT/logs
mkdir -p "$LOGS"
clean() { tr -d '\r\n'; }

export API_URL=http://localhost:3122 WEB_URL=http://localhost:4176
for port in 3122 4176; do
  if netstat -ano | grep -qE ":$port .*LISTEN"; then echo "puerto $port ocupado"; exit 1; fi
done

DB=dsv_$(date -u +%Y%m%d_%H%M%S)
docker exec agro_b_f10eval_pg createdb -U agro "$DB"
export DATABASE_URL=postgresql://agro@127.0.0.1:55450/$DB
export JWT_SECRET=$(openssl rand -hex 32 | clean)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32 | clean)
export SYNC_V1_FINGERPRINT_KEY=$(openssl rand -base64 32 | clean)
export SYNC_V1_FINGERPRINT_KEY_VERSION=1
export EVAL_PASSWORD=$(openssl rand -hex 16 | clean)

# Entorno y versiones (sin secretos).
{
  echo "start=$(date -u +%FT%TZ)"
  echo "db=$DB"
  echo "protocol=docs/evaluation/F10_PROTOCOLOS_EVALUACION.md v1.1 @ 7581af23b417340b7f00fc7e4822dff3ee9a9aab"
  echo "repo_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "code_measured=ed069a695eb9f8bdc318bfd16efc0071fcdced25"
  echo "code_diff_vs_base=$(git -C "$ROOT" diff --stat ed069a6 -- Back/src Web/src Back/prisma | wc -l) líneas de diff en Back/src, Web/src y Back/prisma"
  # Ramas que dependen de NODE_ENV (desviación declarada de §0.4, protocolo v1.1):
  echo "node_env=development (collective-config.ts:20 rechaza provisional-synthetic en producción)"
  echo "collective_disclosure_mode=provisional-synthetic"
  echo "cookie_secure=false explícito (auth-v2.controller.ts:48, auth.controller.ts:41; http en localhost)"
  echo "backup_admission=abierta por NODE_ENV (backups-config.ts:26); sin BACKUP_STORAGE_DIR responde 503; no se usa"
  echo "sync_v1_admission=abierta por NODE_ENV (sync-v1-config.ts:23); no se publica nada por Sync durante la medición"
  echo "throttler=20/min por ruta (app.module.ts), sin cambios"
  echo "node=$(node --version)"
  echo "chrome=$(powershell -NoProfile -Command "(Get-Item 'C:/Program Files/Google/Chrome/Application/chrome.exe').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "edge=$(powershell -NoProfile -Command "(Get-Item 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe').VersionInfo.ProductVersion" | tr -d '\r')"
  echo "puppeteer_core=$(node -p "require('$TOOL/node_modules/puppeteer-core/package.json').version")"
  echo "vite=$(node -p "require('$ROOT/Web/node_modules/vite/package.json').version")"
  echo "postgres=$(docker exec agro_b_f10eval_pg psql -U agro -d "$DB" -tAc 'select version()')"
  echo "postgres_image=$(docker inspect agro_b_f10eval_pg --format '{{.Image}}')"
  powershell -NoProfile -Command "\$c=Get-CimInstance Win32_Processor; \$o=Get-CimInstance Win32_OperatingSystem; 'cpu=' + \$c.Name + ' cores=' + \$c.NumberOfCores + ' threads=' + \$c.NumberOfLogicalProcessors; 'ram_gb=' + [math]::Round(\$o.TotalVisibleMemorySize/1MB,1); 'os=' + \$o.Caption + ' ' + \$o.Version" | tr -d '\r'
} > "$OUT/env.txt"

(cd "$ROOT/Back" && npx prisma migrate deploy > "$LOGS/migrate.log" 2>&1)
(cd "$ROOT/Back" && F10_DSV_SEED=yes node scripts/f10-dsv-central-seed.cjs) > "$OUT/dataset.json"
CAMPAIGN_ID=$(node -e "console.log(require(process.argv[1]).campaigns.C1)" "$OUT/dataset.json")
export CAMPAIGN_ID EVAL_EMAIL=directiva@dsv.example.test

# API compilada. NODE_ENV=development: en producción el modo provisional se
# ignora y el resumen sale en POLICY_PENDING, sin tablas que medir.
(cd "$ROOT/Back" && NODE_ENV=development COOKIE_SECURE=false PORT=3122 CORS_ORIGIN=$WEB_URL COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic \
  exec node dist/main.js > "$LOGS/api.log" 2>&1) &
API_PID=$!
(cd "$ROOT/Web" && VITE_API_PROXY_TARGET=$API_URL exec npx vite preview --port 4176 --strictPort > "$LOGS/web.log" 2>&1) &
WEB_PID=$!
cleanup() {
  kill $API_PID $WEB_PID 2>/dev/null || true
  for port in 3122 4176; do
    for pid in $(netstat -ano | grep -E ":$port .*LISTEN" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done
  done
}
trap cleanup EXIT
for _ in $(seq 1 60); do curl -sf --max-time 2 "$API_URL/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1 && break; sleep 1; done
echo "api_web_ready=$(date -u +%FT%TZ)" >> "$OUT/env.txt"

# Carga de fondo del PC (procesos con más CPU acumulada y uso de CPU en 5 s).
load() {
  # Win32_PerfFormattedData no depende del idioma de Windows (Get-Counter sí).
  powershell -NoProfile -Command "\$v=1..5|%{ (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \"Name='_Total'\").PercentProcessorTime; Start-Sleep -Milliseconds 900 }; 'cpu_percent_5s=' + [math]::Round((\$v|Measure-Object -Average).Average,1); Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 Name,Id,@{n='CPU_s';e={[math]::Round(\$_.CPU,1)}},@{n='WS_MB';e={[math]::Round(\$_.WorkingSet64/1MB)}} | Format-Table -AutoSize | Out-String -Width 160" | tr -d '\r'
}
load > "$OUT/load-before.txt"

REPS=10
[ "$TRIAL" = "ensayo" ] && REPS=2
export REPS WARMUPS=1

# R5b: 1 calentamiento (crea las divulgaciones provisionales) + REPS, cada 5 s.
SPACING_MS=5000 SERIES_LABEL=r5b node "$TOOL/r5.mjs" r5b "$OUT"
sleep 61
# R5a: Chrome (B1) a 1920x1080; frío y caliente.
BROWSER_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" BROWSER_LABEL=chrome VIEWPORT=1920x1080 \
  SPACING_MS=5000 SERIES_LABEL=r5a-chrome node "$TOOL/r5.mjs" r5a "$OUT"
load > "$OUT/load-after.txt"
echo "end=$(date -u +%FT%TZ)" >> "$OUT/env.txt"
# 429 registrados por la API (sólo la línea de la ruta, sin datos de la petición).
grep -c "HTTP 429" "$LOGS/api.log" > "$OUT/api_429_count.txt" || true
