#!/usr/bin/env bash
# Entorno AISLADO de las etapas 1 y 2 (mismos puertos, base y paquete .et1): Central y Web del worktree ET2-BE
# worktree ET1-BE, Web ET1-BE y app del emulador ET1-MOB sobre una copia nueva con datos
# exclusivamente SINTÉTICOS. No toca la DEMO oficial (3330/5190, .demo), la copia «rica»
# (15433/3342/5199, .rica) ni ninguna otra. Secretos sólo en variables de entorno del proceso.
#
#   et1.sh up            PostgreSQL 15434 (contenedor agro_et1_pg, volumen agro_et1_pgdata), API 3350, Web 5175
#   et1.sh seed          siembra «rica» por la API real (idempotente)
#   et1.sh verify        resumen de la siembra
#   et1.sh password-pipe <rol>   contraseña de un solo uso por tubería (nunca en pantalla)
#   et1.sh credential <rol>      la teclea en el emulador (campo de contraseña enfocado)
#   et1.sh tunnel | untunnel     origen HTTPS temporal (cloudflared) → observador 3351 → API 3350
#   et1.sh build-app | install-app   APK «AC ET1» (.et1) desde ET1-MOB con el origen del túnel
#   et1.sh status | down
set -uo pipefail
ROOT=/c/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro
BE=$ROOT/_wt/ET2-BE/Back
WEB=$ROOT/_wt/ET2-BE/Web
MOB=${ET1_MOB:-$ROOT/_wt/ET2-MOB}
CENTRAL=$ROOT/_wt/DEMO-BE/tool/demo/demo-central.cjs
RICA=$ROOT/_wt/ET2-BE/tool/demo-rica/demo-rica.cjs
TUNNEL=$ROOT/_wt/RICA-MOB/tool/f03_res_01/tunnel.sh
CLOUDFLARED=$ROOT/_wt/tools/cloudflared-2026.10.0/cloudflared-windows-amd64.exe
RUN=${ET1_RUN:-${TMPDIR:-/c/Users/MSI/AppData/Local/Temp}/agro_et1}; mkdir -p "$RUN" "$RUN/photos" "$RUN/backups"
PG=agro_et1_pg; VOLUME=agro_et1_pgdata; PGPORT=15434; API=3350; OBS=3351; GATE=3352; WEBPORT=5175
SERIAL=${ET1_SERIAL:-emulator-5554}; SUFFIX=${ET1_SUFFIX:-.et1}; LABEL=${ET1_LABEL:-"AC ET1"}; PKG=com.comunidad.agro.agroquimicos$SUFFIX
export DEMO_PG_ADMIN_URL="postgresql://postgres@127.0.0.1:${PGPORT}/postgres"
export DEMO_API="http://127.0.0.1:${API}/api/v1"
export DEMO_SEED="agrocuentas-etapa1-1"
stamp() { date -u +%FT%TZ; }
log() { echo "$(stamp) $*" | tee -a "$RUN/supervisor.log"; }
listener() { netstat -ano | awk -v p=":$1" '$2 ~ p"$" && $4 == "LISTENING" {print $5; exit}'; }
health() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API/api/v1/health"; }
rica() { ( cd "$BE" && node "$RICA" "$@" ); }

case "${1:-}" in
  up)
    if [ -z "$(docker ps -q --filter name="^${PG}$")" ]; then
      docker start "$PG" > /dev/null 2>&1 || docker run -d --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust \
        -v "$VOLUME:/var/lib/postgresql/data" -p "127.0.0.1:$PGPORT:5432" postgres:16.13 > /dev/null || { log "no se pudo crear $PG"; exit 1; }
    fi
    for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U postgres > /dev/null 2>&1 && break; sleep 1; done
    sleep 2
    ( cd "$BE" && node "$CENTRAL" bootstrap ) >> "$RUN/supervisor.log" 2>&1 || { log "bootstrap fallido"; tail -5 "$RUN/supervisor.log"; exit 1; }
    if [ -z "$(listener $API)" ]; then
      rnd() { openssl rand -base64 "$1" | tr -d '\r\n/+='; }
      JWT=$(rnd 48); JWTR=$(rnd 48); FP=$(rnd 48)
      ( cd "$BE" && env NODE_ENV=development PORT=$API \
          DATABASE_URL="postgresql://postgres@127.0.0.1:${PGPORT}/agro_demo?schema=public" \
          JWT_SECRET="$JWT" JWT_REFRESH_SECRET="$JWTR" JWT_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d \
          COOKIE_SECURE=false CORS_ORIGIN=http://127.0.0.1:$WEBPORT \
          SYNC_V1_FINGERPRINT_KEY="$FP" SYNC_V1_FINGERPRINT_KEY_VERSION=1 SYNC_V1_PRODUCTION_ADMISSION=enabled \
          COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic COLLECTIVE_SEALING=enabled \
          BACKUP_STORAGE_DIR="$(cygpath -w "$RUN/backups")" BACKUP_PRODUCTION_ADMISSION=disabled \
          PRODUCT_PHOTO_STORAGE_DIR="$(cygpath -w "$RUN/photos")" \
          ESTIMATION_WORKER_INTERVAL_MS=1000 \
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
  password-pipe) rica password-pipe "${2:?rol}" ;;
  credential) rica credential-adb "${2:?rol}" "$SERIAL" ;;
  tunnel)
    # Túnel → observador $OBS → compuerta $GATE (sólo /api/v1/) → API $API. Nada más se expone.
    if [ -z "$(listener $GATE)" ]; then
      ET1_GATE_PHOTO_FAIL_FILE="$(cygpath -w "$RUN/gate.photo-fail")" \
        nohup node "$(cygpath -w "$(dirname "$0")/../etapa1/api_gate.cjs")" "$GATE" "$API" > "$RUN/gate.out" 2>&1 &
      echo $! > "$RUN/gate.pid"; sleep 1
    fi
    [ -n "$(listener $GATE)" ] || { echo "la compuerta $GATE no arrancó: no se abre el túnel"; exit 1; }
    F03_BE_DIR=$BE F03_CLOUDFLARED=$CLOUDFLARED F03_API_PORT=$GATE F03_OBSERVER_PORT=$OBS F03_RUN_DIR=$RUN \
      F03_PG_CONTAINER=$PG bash "$TUNNEL" ;;
  untunnel)
    for f in tunnel observer gate; do [ -f "$RUN/$f.pid" ] && kill "$(cat "$RUN/$f.pid")" 2>/dev/null; rm -f "$RUN/$f.pid"; done
    rm -f "$RUN/origin"; echo "túnel y observador cerrados" ;;
  build-app)
    origin=${ET1_ORIGIN:-$(cat "$RUN/origin" 2>/dev/null || true)}; [ -n "$origin" ] || { echo "sin origen HTTPS: primero et1.sh tunnel o ET1_ORIGIN"; exit 1; }
    cd "$MOB"
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
    apk="$RUN/apk/agrocuentas$SUFFIX-profile-x64.apk"; [ -f "$apk" ] || { echo "falta la APK: 'et1.sh build-app'"; exit 1; }
    MSYS_NO_PATHCONV=1 adb -s "$SERIAL" install -r "$(cygpath -w "$apk")" | tail -1
    echo "instalado $PKG en $SERIAL" ;;
  status)
    echo "contenedor: $(docker ps --filter name="^${PG}$" --format '{{.Status}}' | head -1)"
    echo "API $API: $(health) · Web $WEBPORT: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEBPORT/")"
    origin=$(cat "$RUN/origin" 2>/dev/null || true)
    [ -n "$origin" ] && echo "túnel: $(curl -s -o /dev/null -w '%{http_code}' "$origin/api/v1/health") (origen en $RUN/origin, no se publica)" || echo "túnel: cerrado"
    MSYS_NO_PATHCONV=1 adb -s "$SERIAL" shell pm list packages 2>/dev/null | grep -q "$PKG" && echo "app $PKG instalada en $SERIAL" || echo "app $PKG no instalada" ;;
  down)
    bash "$0" untunnel
    for port in $WEBPORT $API; do pid=$(listener $port); [ -n "$pid" ] && taskkill //PID "$pid" //F > /dev/null 2>&1; done
    docker stop "$PG" > /dev/null 2>&1; log "entorno ET1 detenido (volumen $VOLUME conservado)" ;;
  *) sed -n 2,13p "$0"; exit 2 ;;
esac
