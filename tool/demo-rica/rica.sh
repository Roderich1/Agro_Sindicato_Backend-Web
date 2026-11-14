#!/usr/bin/env bash
# DEMO «rica» de Agrocuentas (defensa, 2026-11-05): Central, Web y app del emulador
# conectadas a una copia AISLADA con datos exclusivamente SINTÉTICOS. No toca la DEMO
# oficial (agro_demo_pg, 3330/3331/5190, app «AC DEMO» .demo) ni otras copias.
#
#   rica.sh up                    PostgreSQL 55512 (volumen agro_rica_pgdata), API 3342 y Web 5199
#   rica.sh seed | verify         siembra por la API real (idempotente) | resumen verificable
#   rica.sh password <rol>        contraseña nueva de un solo uso AL PORTAPAPELES (no se imprime)
#   rica.sh credential <rol>      la TECLEA en el emulador, sólo si el campo enfocado es de contraseña
#   rica.sh tunnel | untunnel     túnel HTTPS temporal (cloudflared) → observador 3343 → API 3342
#   rica.sh build-app             APK «AC RICA» (.rica) desde _wt/RICA-MOB con el origen del túnel
#   rica.sh install-app           instala/actualiza SÓLO .rica (conserva sus datos)
#   rica.sh status | down         estado | detiene Web, API, túnel y contenedor (los datos se conservan)
#
# Roles: admin, directiva, agricultor1 … agricultor14 (con historia) y agricultor15 (limpio,
# para el teléfono). Las contraseñas nunca se imprimen ni se guardan.
set -uo pipefail
ROOT=/c/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro
BE=$ROOT/_wt/DEMO-BE/Back
CENTRAL=$ROOT/_wt/DEMO-BE/tool/demo/demo-central.cjs
RICA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/demo-rica.cjs"
WEB=$ROOT/_wt/WEB-PANEL/Web
MOB=$ROOT/_wt/RICA-MOB
CLOUDFLARED=$ROOT/_wt/tools/cloudflared-2026.10.0/cloudflared-windows-amd64.exe
RUN=${RICA_RUN:-/c/Users/MSI/AppData/Local/Temp/agro_rica}; mkdir -p "$RUN"
PG=agro_rica_pg; VOLUME=agro_rica_pgdata; PGPORT=55512; API=3342; OBS=3343; WEBPORT=5199
SERIAL=${RICA_SERIAL:-emulator-5554}; SUFFIX=.rica; LABEL="AC RICA"; PKG=com.comunidad.agro.agroquimicos$SUFFIX
export DEMO_PG_ADMIN_URL="postgresql://postgres@127.0.0.1:${PGPORT}/postgres"
export DEMO_API="http://127.0.0.1:${API}/api/v1"
stamp() { date -u +%FT%TZ; }
log() { echo "$(stamp) $*" | tee -a "$RUN/supervisor.log"; }
listener() { netstat -ano | awk -v p=":$1" '$2 ~ p"$" && $4 == "LISTENING" {print $5; exit}'; }
health() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API/api/v1/health"; }
rica() { ( cd "$BE" && node "$RICA" "$@" ); }

case "${1:-}" in
  up)
    if [ -z "$(docker ps -q --filter name="^${PG}$")" ]; then
      docker run -d --rm --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$VOLUME:/var/lib/postgresql/data" \
        -p "127.0.0.1:$PGPORT:5432" postgres:16.13 > /dev/null || { log "no se pudo crear $PG"; exit 1; }
    fi
    for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U postgres > /dev/null 2>&1 && break; sleep 1; done
    sleep 2
    ( cd "$BE" && node "$CENTRAL" bootstrap ) >> "$RUN/supervisor.log" 2>&1 || { log "bootstrap fallido"; exit 1; }
    if [ -z "$(listener $API)" ]; then
      rnd() { openssl rand -base64 "$1" | tr -d '\r\n/+='; }
      JWT=$(rnd 48); JWTR=$(rnd 48); FP=$(rnd 48)
      ( cd "$BE" && env NODE_ENV=development PORT=$API \
          DATABASE_URL="postgresql://postgres@127.0.0.1:${PGPORT}/agro_demo?schema=public" \
          JWT_SECRET="$JWT" JWT_REFRESH_SECRET="$JWTR" JWT_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d \
          COOKIE_SECURE=false CORS_ORIGIN=http://127.0.0.1:$WEBPORT \
          SYNC_V1_FINGERPRINT_KEY="$FP" SYNC_V1_FINGERPRINT_KEY_VERSION=1 SYNC_V1_PRODUCTION_ADMISSION=enabled \
          COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic COLLECTIVE_SEALING=enabled \
          BACKUP_PRODUCTION_ADMISSION=disabled ESTIMATION_WORKER_INTERVAL_MS=1000 \
          node dist/main.js >> "$RUN/api.log" 2>&1 ) &
      JWT=; JWTR=; FP=
    fi
    for _ in $(seq 1 90); do [ "$(health)" = 200 ] && break; sleep 1; done
    log "API $API: health $(health)"
    if [ -z "$(listener $WEBPORT)" ]; then
      ( cd "$WEB" && VITE_API_PROXY_TARGET="http://127.0.0.1:$API" npx vite --host 127.0.0.1 --port $WEBPORT --strictPort >> "$RUN/web.log" 2>&1 ) &
      for _ in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEBPORT/")" = 200 ] && break; sleep 1; done
    fi
    log "Web en http://127.0.0.1:$WEBPORT (proxy a $API)"; log "listo" ;;
  seed) rica seed ;;
  verify) rica verify ;;
  password) rica password "${2:?rol}" ;;
  credential) rica credential-adb "${2:?rol}" "$SERIAL" ;;
  tunnel)
    [ -f "$MOB/tool/f03_res_01/tunnel.sh" ] || { echo "falta el worktree $MOB"; exit 1; }
    F03_BE_DIR=$BE F03_CLOUDFLARED=$CLOUDFLARED F03_API_PORT=$API F03_OBSERVER_PORT=$OBS F03_RUN_DIR=$RUN \
      F03_PG_CONTAINER=$PG bash "$MOB/tool/f03_res_01/tunnel.sh" ;;
  untunnel)
    for f in tunnel observer; do [ -f "$RUN/$f.pid" ] && kill "$(cat "$RUN/$f.pid")" 2>/dev/null; rm -f "$RUN/$f.pid"; done
    echo "túnel y observador cerrados" ;;
  build-app)
    origin=$(cat "$RUN/origin" 2>/dev/null || true); [ -n "$origin" ] || { echo "sin origen HTTPS: primero 'rica.sh tunnel'"; exit 1; }
    cd "$MOB"
    [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "hay cambios en archivos versionados de $MOB"; exit 1; }
    gradle=android/app/build.gradle.kts; manifest=android/app/src/main/AndroidManifest.xml
    trap 'git checkout -q -- "$gradle" "$manifest"' EXIT
    mkdir -p "$RUN/apk"
    python -I - "$gradle" "$manifest" "$SUFFIX" "$LABEL" <<'PY'
import sys, pathlib
gradle, manifest, suffix, label = sys.argv[1:5]
g = pathlib.Path(gradle); s = g.read_text(encoding='utf-8'); nl = '\r\n' if '\r\n' in s else '\n'
anchor = '    buildTypes {' + nl
assert s.count(anchor) == 1, 'buildTypes no encontrado'
g.write_text(s.replace(anchor, anchor + f'        getByName("profile") {{{nl}            applicationIdSuffix = "{suffix}"{nl}        }}{nl}'), encoding='utf-8', newline='')
m = pathlib.Path(manifest); t = m.read_text(encoding='utf-8')
assert t.count('android:label="agroquimicos"') == 1, 'label no encontrado'
m.write_text(t.replace('android:label="agroquimicos"', f'android:label="{label}"'), encoding='utf-8', newline='')
PY
    flutter build apk --profile --target-platform android-x64 --dart-define=AGRO_API_BASE_URL="$origin" \
      > "$RUN/apk/build.log" 2>&1 || { tail -20 "$RUN/apk/build.log"; exit 1; }
    cp build/app/outputs/flutter-apk/app-profile.apk "$RUN/apk/agrocuentas$SUFFIX-profile-x64.apk"
    git checkout -q -- "$gradle" "$manifest"; trap - EXIT
    echo "APK $PKG · Mobile $(git rev-parse HEAD) · SHA-256 $(sha256sum "$RUN/apk/agrocuentas$SUFFIX-profile-x64.apk" | awk '{print $1}')" ;;
  install-app)
    apk="$RUN/apk/agrocuentas$SUFFIX-profile-x64.apk"; [ -f "$apk" ] || { echo "falta la APK: 'rica.sh build-app'"; exit 1; }
    MSYS_NO_PATHCONV=1 adb -s "$SERIAL" install -r "$(cygpath -w "$apk")" | tail -1
    echo "instalado $PKG en $SERIAL (la app «AC DEMO» no se toca)" ;;
  status)
    echo "contenedor: $(docker ps --filter name="^${PG}$" --format '{{.Status}}' | head -1)"
    echo "API $API: $(health) · Web $WEBPORT: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEBPORT/")"
    origin=$(cat "$RUN/origin" 2>/dev/null || true)
    [ -n "$origin" ] && echo "túnel: $(curl -s -o /dev/null -w '%{http_code}' "$origin/api/v1/health") (origen en $RUN/origin)" || echo "túnel: cerrado"
    MSYS_NO_PATHCONV=1 adb -s "$SERIAL" shell pm list packages 2>/dev/null | grep -q "$PKG" && echo "app $PKG instalada en $SERIAL" || echo "app $PKG no instalada" ;;
  down)
    bash "$0" untunnel
    for port in $WEBPORT $API; do pid=$(listener $port); [ -n "$pid" ] && taskkill //PID "$pid" //F > /dev/null 2>&1; done
    docker stop "$PG" > /dev/null 2>&1; log "copia rica detenida (volumen $VOLUME conservado)" ;;
  *) sed -n 2,16p "$0"; exit 2 ;;
esac
