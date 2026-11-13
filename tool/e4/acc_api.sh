#!/usr/bin/env bash
# Verificación E4 (2026-11-13): (re)arranque de la API E4 3400 sobre la base
# acc_api (agro_acc_pg, 15440), con el entorno de la evidencia del Backend §6
# más Sync v1 abierto (autorizado por el orquestador el 2026-11-13: la API se
# había arrancado sin SYNC_V1_FINGERPRINT_KEY y todo push respondía 503).
#
# Los secretos se generan aquí y se EXPORTAN dentro de una subshell que hace
# `exec node`: no van en la línea de comandos de ningún proceso (ni env.exe)
# y nunca se imprimen ni se escriben. Sólo se ejecuta el dist de _wt/ACC-A/Back
# (Back idéntico al de 05a4ab9).
#
#   acc_api.sh restart   detiene el proceso que escucha en 3400 (por PID) y arranca
#   acc_api.sh status
set -uo pipefail
ROOT=/c/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro
BE=$ROOT/_wt/ACC-A/Back
RUN=/c/Users/MSI/AppData/Local/Temp/agro_acc_verif; mkdir -p "$RUN/backups" "$RUN/photos"
API=3400
listener() { netstat -ano | awk -v p=":$1" '$2 ~ p"$" && $4 == "LISTENING" {print $5; exit}'; }
health() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API/api/v1/health"; }
case "${1:-}" in
  restart)
    pid=$(listener $API)
    if [ -n "$pid" ]; then taskkill //PID "$pid" //F > /dev/null 2>&1 || { echo "no se pudo detener el PID $pid"; exit 1; }; fi
    for _ in $(seq 1 20); do [ -z "$(listener $API)" ] && break; sleep 1; done
    [ -z "$(listener $API)" ] || { echo "el puerto $API sigue ocupado"; exit 1; }
    (
      cd "$BE" || exit 1
      rnd() { openssl rand -base64 "$1" | tr -d '\r\n/+='; }
      export NODE_ENV=development PORT=$API \
        DATABASE_URL="postgresql://postgres@127.0.0.1:15440/acc_api?schema=public" \
        JWT_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d COOKIE_SECURE=false CORS_ORIGIN=http://127.0.0.1:5184 \
        SYNC_V1_FINGERPRINT_KEY_VERSION=1 SYNC_V1_PRODUCTION_ADMISSION=enabled \
        COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic COLLECTIVE_SEALING=enabled COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02 \
        BACKUP_STORAGE_DIR="$(cygpath -w "$RUN/backups")" BACKUP_PRODUCTION_ADMISSION=disabled \
        PRODUCT_PHOTO_STORAGE_DIR="$(cygpath -w "$RUN/photos")" ESTIMATION_WORKER_INTERVAL_MS=1000
      JWT_SECRET=$(rnd 48); JWT_REFRESH_SECRET=$(rnd 48); SYNC_V1_FINGERPRINT_KEY=$(rnd 48)
      export JWT_SECRET JWT_REFRESH_SECRET SYNC_V1_FINGERPRINT_KEY
      exec node dist/main.js >> "$RUN/api.log" 2>&1
    ) &
    for _ in $(seq 1 90); do [ "$(health)" = 200 ] && break; sleep 1; done
    echo "$(date -u +%FT%TZ) API $API reiniciada: health $(health), PID $(listener $API)" | tee -a "$RUN/supervisor.log" ;;
  status) echo "API $API: health $(health), PID $(listener $API)" ;;
  *) sed -n 2,13p "$0"; exit 2 ;;
esac
