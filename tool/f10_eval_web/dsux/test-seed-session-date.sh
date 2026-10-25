#!/usr/bin/env bash
# Prueba mínima de la validación de F10_UX_SESSION_DATE en el generador
# Central (Back/scripts/f10-dsux-central-seed.cjs), con los dos destinos.
# Sin PostgreSQL: DATABASE_URL apunta a un puerto local cerrado. Una fecha
# inválida debe terminar con el error de la fecha y SIN intentar conectar;
# una válida pasa la validación y sólo falla al conectar (prueba de que llegó
# hasta ahí). Requiere Back/node_modules con el cliente de Prisma generado.
#
#   tool/f10_eval_web/dsux/test-seed-session-date.sh
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
SEED=$ROOT/Back/scripts/f10-dsux-central-seed.cjs
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
fails=0
ok() { echo "PASS $1"; }
ko() { echo "FAIL $1: $2"; fails=$((fails + 1)); }
# Valores de prueba: ninguno es un secreto real ni se usa contra un servicio.
export NODE_ENV=development F10_UX_SYNTHETIC_SEED=yes
export DATABASE_URL=postgresql://f10ux@127.0.0.1:9/f10ux_sin_base
export JWT_SECRET=prueba-sin-uso API_URL=http://127.0.0.1:9 F10_UX_PASSWORD=prueba-sin-uso F10_UX_LABEL=TEST
CONNECT='P1001|Can.t reach database|ECONNREFUSED|connect'

run() { # destino valor|<unset> salida
  local target=$1 value=$2 out=$3
  (
    export F10_UX_TARGET=$target F10_UX_REFERENCES=$out/references.json F10_UX_MANIFEST=$out/manifest.json
    if [ "$value" = "<unset>" ]; then unset F10_UX_SESSION_DATE; else export F10_UX_SESSION_DATE=$value; fi
    cd "$ROOT/Back" && node "$SEED"
  ) > "$out.out" 2> "$out.err"
}

invalid() { # nombre valor
  for target in web movil; do
    local name="$1/$target" out=$WORK/$1-$target status
    mkdir -p "$out"
    run "$target" "$2" "$out"
    status=$?
    if [ $status -ne 0 ] && grep -qE 'F10_UX_SESSION_DATE' "$out.err" && ! grep -qE "$CONNECT" "$out.err" && [ -z "$(ls -A "$out")" ]; then
      ok "$name ('$2') → código $status, «$(grep -m1 -E '^Error: ' "$out.err" | head -c 90)», sin conexión ni archivos"
    else
      ko "$name ('$2')" "código $status, archivos: $(ls -A "$out" | tr '\n' ' '), stderr: $(grep -m2 -E 'Error|error' "$out.err" | head -c 300)"
    fi
  done
}
invalid falta '<unset>'
invalid vacia ''
invalid dia-31-feb '2026-02-31'
invalid no-bisiesto-2026 '2026-02-29'
invalid no-bisiesto-2025 '2025-02-29'
invalid mes-13 '2026-13-01'
invalid formato-dmy '26-10-2026'
invalid con-espacio ' 2026-10-25'
invalid con-sufijo '2026-10-25x'

valid() { # nombre valor
  for target in web movil; do
    local name="$1/$target" out=$WORK/$1-$target status
    mkdir -p "$out"
    run "$target" "$2" "$out"
    status=$?
    if [ $status -ne 0 ] && ! grep -qE 'F10_UX_SESSION_DATE' "$out.err" && grep -qE "$CONNECT" "$out.err"; then
      ok "$name ('$2') → validación superada; sólo falla al conectar a la base inexistente"
    else
      ko "$name ('$2')" "código $status, stderr: $(grep -m2 -E 'Error|error' "$out.err" | head -c 300)"
    fi
  done
}
valid bisiesto '2024-02-29'
valid sesion '2026-10-25'

if [ $fails -eq 0 ]; then echo "seed session-date: todo PASS"; else echo "seed session-date: $fails FAIL"; exit 1; fi
