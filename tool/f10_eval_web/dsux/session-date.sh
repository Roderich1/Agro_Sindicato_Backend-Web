# F10 usabilidad, DS-UX: el día de sesión es siempre explícito (decisión de
# Roderich Rendón, 2026-10-24). Sin valor por defecto: ni de la zona horaria ni
# del reloj del entorno. La misma fecha se usa en Central y en Mobile.
#
#   . tool/f10_eval_web/dsux/session-date.sh
#   require_session_date   # termina con código 2 si falta o no es válida
#
# Válida = formato AAAA-MM-DD y una fecha de calendario real (se comprueba en
# UTC, sin depender de TZ ni de tzdata: 2026-02-31 se rechaza).
require_session_date() {
  local value=${F10_UX_SESSION_DATE-}
  local hint="Indique el día de sesión, por ejemplo: F10_UX_SESSION_DATE=2026-10-26 (AAAA-MM-DD, la misma fecha en Central y Mobile)."
  if [ -z "$value" ]; then
    echo "ERROR: falta F10_UX_SESSION_DATE. No hay valor por defecto. $hint" >&2
    exit 2
  fi
  if ! [[ $value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "ERROR: F10_UX_SESSION_DATE='$value' no tiene el formato AAAA-MM-DD. $hint" >&2
    exit 2
  fi
  if [ "$(date -u -d "${value}T00:00:00Z" +%F 2>/dev/null)" != "$value" ]; then
    echo "ERROR: F10_UX_SESSION_DATE='$value' no es una fecha de calendario real. $hint" >&2
    exit 2
  fi
  export F10_UX_SESSION_DATE=$value
}
