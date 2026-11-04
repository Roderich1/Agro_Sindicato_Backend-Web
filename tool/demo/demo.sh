#!/usr/bin/env bash
# DEMO de Agrocuentas (OE3, 2026-11-03): Backend real + base propia + Web, con datos
# exclusivamente SINTÉTICOS. No toca pilotos, EXP, UX, AV, OE3 ni sus contenedores.
#
#   demo.sh up              supervisor en primer plano: PostgreSQL (volumen persistente),
#                           migraciones/arranque de identidad, API y Web. Lanzarlo en
#                           segundo plano y pararlo con `demo.sh down`.
#   demo.sh seed            siembra central por la API real (idempotente)
#   demo.sh verify          resumen verificable de lo sembrado
#   demo.sh password <rol>  contraseña nueva de un solo uso al portapapeles (admin,
#                           directiva, agricultor1…agricultor6); nunca se imprime
#   demo.sh credential <rol> [serial]   teclea una contraseña de un solo uso en el campo
#                           de contraseña ENFOCADO del dispositivo (emulador por defecto)
#   demo.sh references <agricultor> <archivo>   GET /sync/v1/references, como la app
#   demo.sh status          estado de contenedor, API y Web
#   demo.sh down            detiene API, Web y contenedor (los datos se conservan)
#   demo.sh reset           borra SÓLO la DEMO tras comprobar su identidad (pide CONFIRMAR)
#
# Puertos propios: PostgreSQL 127.0.0.1:55500 · API 127.0.0.1:3330 · Web 127.0.0.1:5190.
# Los secretos JWT y de huella sync viven en la memoria del supervisor: al reiniciarlo
# se generan otros (las sesiones se renuevan por refresh; ver docs/demo/DEMO_AGROCUENTAS.md).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$here/../.." && pwd)"
BE="$REPO/Back"; WEB="$REPO/Web"
RUN=${DEMO_RUN:-/c/Users/MSI/AppData/Local/Temp/agro_demo}
PG=agro_demo_pg; VOLUME=agro_demo_pgdata; PGPORT=55500; API=3330; WEBPORT=5190
export DEMO_PG_ADMIN_URL="postgresql://postgres@127.0.0.1:${PGPORT}/postgres"
export DEMO_API="http://127.0.0.1:${API}/api/v1"
mkdir -p "$RUN"
stamp() { date -u +%FT%TZ; }
log() { echo "$(stamp) $*" | tee -a "$RUN/supervisor.log"; }
listener() { netstat -ano | awk -v p=":$1" '$2 ~ p"$" && $4 == "LISTENING" {print $5; exit}'; }
central() { ( cd "$BE" && node "$here/demo-central.cjs" "$@" ); }
health() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API/api/v1/health"; }

case "${1:-}" in
  up)
    [ -f "$RUN/supervisor.pid" ] && kill -0 "$(cat "$RUN/supervisor.pid")" 2>/dev/null && { echo "ya está en marcha"; exit 1; }
    echo $$ > "$RUN/supervisor.pid"; rm -f "$RUN/stop"
    if [ -z "$(docker ps -q --filter name="^${PG}$")" ]; then
      docker run -d --rm --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$VOLUME:/var/lib/postgresql/data" \
        -p "127.0.0.1:$PGPORT:5432" postgres:16.13 > /dev/null || { log "no se pudo crear $PG"; exit 1; }
    fi
    for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U postgres > /dev/null 2>&1 && break; sleep 1; done
    sleep 2
    central bootstrap >> "$RUN/supervisor.log" 2>&1 || { log "arranque de identidad fallido"; exit 1; }
    log "PostgreSQL $PG (volumen $VOLUME) y base agro_demo listas"
    rnd() { openssl rand -base64 "$1" | tr -d '\r\n/+='; }
    JWT=$(rnd 48); JWTR=$(rnd 48); FP=$(openssl rand -base64 32 | tr -d '\r\n')
    ( cd "$BE" && env NODE_ENV=development PORT=$API \
        DATABASE_URL="postgresql://postgres@127.0.0.1:${PGPORT}/agro_demo?schema=public" \
        JWT_SECRET="$JWT" JWT_REFRESH_SECRET="$JWTR" JWT_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d \
        COOKIE_SECURE=false CORS_ORIGIN=http://127.0.0.1:$WEBPORT \
        SYNC_V1_FINGERPRINT_KEY="$FP" SYNC_V1_FINGERPRINT_KEY_VERSION=1 SYNC_V1_PRODUCTION_ADMISSION=enabled \
        COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic COLLECTIVE_SEALING=enabled \
        BACKUP_PRODUCTION_ADMISSION=disabled ESTIMATION_WORKER_INTERVAL_MS=1000 \
        node dist/main.js >> "$RUN/api.log" 2>&1 ) &
    JWT=; JWTR=; FP=
    for _ in $(seq 1 90); do [ "$(health)" = 200 ] && break; sleep 1; done
    log "API DEMO en $API: health $(health) (modo provisional sintético, sellado habilitado)"
    ( cd "$WEB" && VITE_API_PROXY_TARGET="http://127.0.0.1:$API" npx vite --host 127.0.0.1 --port $WEBPORT --strictPort >> "$RUN/web.log" 2>&1 ) &
    for _ in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEBPORT/")" = 200 ] && break; sleep 1; done
    log "Web DEMO en http://127.0.0.1:$WEBPORT"
    log "listo"
    while [ ! -f "$RUN/stop" ]; do sleep 2; done
    for port in $WEBPORT $API; do pid=$(listener $port); [ -n "$pid" ] && taskkill //PID "$pid" //F > /dev/null 2>&1; done
    docker stop "$PG" > /dev/null 2>&1
    rm -f "$RUN/stop" "$RUN/supervisor.pid"
    log "supervisor terminado: Web, API y contenedor detenidos (datos conservados en $VOLUME)" ;;
  seed) central seed ;;
  verify) central verify ;;
  password) central password "${2:?rol}" ;;
  credential) central credential-adb "${2:?rol}" "${3:-emulator-5554}" ;;
  references) central references "${2:?agricultor}" "$(cygpath -w "${3:?archivo}")" ;;
  status)
    echo "contenedor: $(docker ps --filter name="^${PG}$" --format '{{.Status}}' | head -1)"
    echo "volumen: $(docker volume ls -q --filter name="^${VOLUME}$")"
    echo "API $API: $(health) · Web $WEBPORT: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEBPORT/")" ;;
  down) touch "$RUN/stop"; echo "parada pedida al supervisor" ;;
  reset)
    [ "$(health)" = 200 ] || { echo "la DEMO debe estar en marcha para comprobar su identidad"; exit 1; }
    central check-identity || { echo "ABORTADO: no es la base DEMO"; exit 3; }
    read -r -p "Escriba CONFIRMAR para borrar la DEMO (contenedor $PG y volumen $VOLUME): " answer
    [ "$answer" = CONFIRMAR ] || { echo "cancelado"; exit 1; }
    touch "$RUN/stop"; for _ in $(seq 1 30); do [ -f "$RUN/supervisor.pid" ] || break; sleep 1; done
    docker volume rm "$VOLUME" > /dev/null && echo "DEMO borrada: volumen $VOLUME eliminado" ;;
  *) sed -n '2,17p' "$0"; exit 2 ;;
esac
