#!/usr/bin/env bash
# Prueba mínima del día de sesión explícito de run-dsux.sh (session-date.sh).
# Sin PostgreSQL ni Web: los casos inválidos terminan antes de crear nada, y
# los válidos llegan hasta la comprobación del contenedor, que aquí no existe.
#
#   tool/f10_eval_web/dsux/test-session-date.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
fails=0
ok() { echo "PASS $1"; }
ko() { echo "FAIL $1: $2"; fails=$((fails + 1)); }
# Puertos y contenedor que no se usan: la ejecución válida se detiene en
# «falta el contenedor», antes de tocar Docker, Node o el navegador.
export PG_CONTAINER=f10ux-test-sin-contenedor API_PORT=3997 WEB_PORT=4997

invalid() { # nombre valor|<unset>
  local name=$1 out=$WORK/out-$1 status
  if [ "$2" = "<unset>" ]; then
    (unset F10_UX_SESSION_DATE; bash "$HERE/run-dsux.sh" "$out") > "$WORK/$name.out" 2> "$WORK/$name.err"
  else
    F10_UX_SESSION_DATE=$2 bash "$HERE/run-dsux.sh" "$out" > "$WORK/$name.out" 2> "$WORK/$name.err"
  fi
  status=$?
  if [ $status -eq 2 ] && grep -q '^ERROR: .*F10_UX_SESSION_DATE' "$WORK/$name.err" && [ ! -e "$out" ]; then
    ok "$name ('$2') → código 2, «$(head -c 70 "$WORK/$name.err")…», sin salida creada"
  else
    ko "$name ('$2')" "código $status, salida creada: $([ -e "$out" ] && echo sí || echo no), stderr: $(head -c 200 "$WORK/$name.err")"
  fi
}
invalid falta '<unset>'
invalid vacia ''
invalid formato-dmy '26-10-2026'
invalid formato-corto '2026-1-05'
invalid con-espacio ' 2026-10-26'
invalid con-sufijo '2026-10-26x'
invalid mes-13 '2026-13-01'
invalid dia-inexistente '2026-02-31'
invalid no-bisiesto '2025-02-29'

valid() { # nombre valor
  local name=$1 out=$WORK/out-$1 status propagated
  F10_UX_SESSION_DATE=$2 bash "$HERE/run-dsux.sh" "$out" > "$WORK/$name.out" 2> "$WORK/$name.err"
  status=$?
  propagated=$(F10_UX_SESSION_DATE=$2 bash -c ". '$HERE/session-date.sh'; require_session_date; printenv F10_UX_SESSION_DATE")
  if [ $status -eq 1 ] && grep -q "falta el contenedor $PG_CONTAINER" "$WORK/$name.out" && [ -d "$out" ] && [ "$propagated" = "$2" ]; then
    ok "$name ('$2') → aceptada; llega a la comprobación del contenedor y se exporta sin cambios ('$propagated')"
  else
    ko "$name ('$2')" "código $status, propagada '$propagated', stdout: $(head -c 200 "$WORK/$name.out"), stderr: $(head -c 200 "$WORK/$name.err")"
  fi
}
valid valida '2026-10-26'
valid bisiesto '2024-02-29'

if [ $fails -eq 0 ]; then echo "session-date: todo PASS"; else echo "session-date: $fails FAIL"; exit 1; fi
