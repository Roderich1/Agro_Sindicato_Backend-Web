#!/usr/bin/env bash
# CIERRE (2026-11-13): copia de tool/e4/acc_env.sh para el recorrido de cierre: paquete .cierre ("AC CIERRE"),
# app desde $CIERRE_MOB (por defecto _wt/CIERRE-MOB); túnel autorizado por el autor el 2026-11-13 para el cierre.
# Verificación E4 (2026-11-13): copia adaptada de _wt/RDM-MOB/tool/rediseno/rdm_env.sh
# (que NO se modifica). App aislada «AC E4» (.acc) en el emulador Pixel_8
# (emulator-5558) contra la API E4 3400 (base acc_api, datos SINTÉTICOS),
# por un túnel HTTPS temporal (autorizado por el autor el 2026-11-13 para esta
# verificación). El origen del túnel sólo vive en $RUN/origin: nunca se imprime.
#
#   acc_env.sh tunnel | untunnel   origen HTTPS → observador 3401 → compuerta 3402 → API 3400
#   acc_env.sh build-app [etiqueta]  APK .acc profile x64 desde $ACC_MOB (por defecto _wt/ACC-MOB),
#                                  con el origen del túnel; la copia queda en $RUN/apk/agrocuentas.cierre-<etiqueta>.apk
#   acc_env.sh install-app <etiqueta>  adb install -r (conserva los datos de .acc)
#   acc_env.sh credential <F1|…>   teclea una contraseña nueva de un solo uso SÓLO en un campo de contraseña enfocado
#   acc_env.sh status
set -uo pipefail
ROOT=/c/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOB=${CIERRE_MOB:-$ROOT/_wt/CIERRE-MOB}
BE=$ROOT/_wt/ACC-A/Back
GATE_JS=$ROOT/_wt/ACC-VERIF/tool/etapa1/api_gate.cjs
TUNNEL=$ROOT/_wt/RICA-MOB/tool/f03_res_01/tunnel.sh
CLOUDFLARED=$ROOT/_wt/tools/cloudflared-2026.10.0/cloudflared-windows-amd64.exe
RUN=${ACC_RUN:-/c/Users/MSI/AppData/Local/Temp/agro_acc_verif}; mkdir -p "$RUN"
API=3400; OBS=3401; GATE=3402
SERIAL=${CIERRE_SERIAL:-emulator-5558}; SUFFIX=.cierre; LABEL="AC CIERRE"; PKG=com.comunidad.agro.agroquimicos$SUFFIX
adb() { MSYS_NO_PATHCONV=1 command adb "$@"; }
listener() { netstat -ano | awk -v p=":$1" '$2 ~ p"$" && $4 == "LISTENING" {print $5; exit}'; }
health() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API/api/v1/health"; }
case "${1:-}" in
  tunnel)
    [ "$(health)" = 200 ] || { echo "la API $API no responde"; exit 1; }
    if [ -z "$(listener $GATE)" ]; then
      nohup node "$(cygpath -w "$GATE_JS")" "$GATE" "$API" > "$RUN/gate.out" 2>&1 &
      echo $! > "$RUN/gate.pid"; sleep 1
    fi
    [ -n "$(listener $GATE)" ] || { echo "la compuerta $GATE no arrancó: no se abre el túnel"; exit 1; }
    F03_BE_DIR=$BE F03_CLOUDFLARED=$CLOUDFLARED F03_API_PORT=$GATE F03_OBSERVER_PORT=$OBS F03_RUN_DIR=$RUN \
      F03_PG_CONTAINER=agro_acc_pg bash "$TUNNEL" ;;
  untunnel)
    for f in tunnel observer gate; do [ -f "$RUN/$f.pid" ] && kill "$(cat "$RUN/$f.pid")" 2>/dev/null; rm -f "$RUN/$f.pid"; done
    for p in $OBS $GATE; do pid=$(listener $p); [ -n "$pid" ] && taskkill //PID "$pid" //F > /dev/null 2>&1; done
    rm -f "$RUN/origin"; echo "túnel, observador y compuerta cerrados" ;;
  build-app)
    tag=${2:-nueva}
    origin=$(cat "$RUN/origin" 2>/dev/null || true); [ -n "$origin" ] || { echo "sin origen HTTPS: primero acc_env.sh tunnel"; exit 1; }
    cd "$MOB"
    gradle=android/app/build.gradle.kts; manifest=android/app/src/main/AndroidManifest.xml
    [ -z "$(git status --porcelain -- "$gradle" "$manifest")" ] || { echo "ABORTADO: $gradle o $manifest tienen cambios"; exit 1; }
    short=$(git rev-parse --short HEAD); dirty=$([ -n "$(git status --porcelain --untracked-files=no)" ] && echo "+cambios" || true)
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
      --dart-define=AGRO_APP_COMMIT="$short$dirty" > "$RUN/apk/build-$tag.log" 2>&1 || { grep -v -i "trycloudflare" "$RUN/apk/build-$tag.log" | tail -25; exit 1; }
    cp build/app/outputs/flutter-apk/app-profile.apk "$RUN/apk/agrocuentas$SUFFIX-$tag.apk"
    git checkout -q -- "$gradle" "$manifest"; trap - EXIT
    echo "APK $PKG ($tag) · Mobile $(git rev-parse HEAD)$dirty · SHA-256 $(sha256sum "$RUN/apk/agrocuentas$SUFFIX-$tag.apk" | awk '{print $1}')" | tee -a "$RUN/apk/apks.txt" ;;
  install-app)
    apk="$RUN/apk/agrocuentas$SUFFIX-${2:?etiqueta}.apk"; [ -f "$apk" ] || { echo "falta la APK $apk"; exit 1; }
    out=$(adb -s "$SERIAL" install -r "$(cygpath -w "$apk")" 2>&1 | tr -d '\r')
    echo "$out" | tail -1
    echo "$out" | grep -qx "Success" && echo "instalado $PKG ($2) en $SERIAL" || { echo "NO instalado"; exit 1; } ;;
  credential)
    ( cd "$here" && node credential_adb.cjs "${2:?cuenta}" "$SERIAL" ) ;;
  status)
    echo "API $API: $(health)"
    origin=$(cat "$RUN/origin" 2>/dev/null || true)
    [ -n "$origin" ] && echo "túnel: $(curl -s -o /dev/null -w '%{http_code}' "$origin/api/v1/health") (origen en $RUN/origin, no se publica)" || echo "túnel: cerrado"
    adb -s "$SERIAL" shell pm list packages 2>/dev/null | grep -q "$PKG" && echo "app $PKG instalada en $SERIAL" || echo "app $PKG no instalada" ;;
  *) sed -n 2,14p "$0"; exit 2 ;;
esac
