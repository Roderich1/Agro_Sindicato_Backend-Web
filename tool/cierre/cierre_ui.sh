#!/usr/bin/env bash
# CIERRE: copia de tool/e4/acc_ui.sh para el paquete .cierre.
# Verificación E4: copia adaptada de _wt/RDM-MOB/tool/rediseno/rdm_ui.sh para «AC E4»
# (.acc) en emulator-5558. Cada orden comprueba antes que .acc esté en primer
# plano: nunca toca otra app. `texts` lista los textos visibles con un filtro que
# oculta cadenas tipo clave ([A-Z0-9_-]{12,} y alfanuméricas de 16+ con dígitos) y abandona si hay un
# campo de contraseña con texto. No usar `type` con secretos (ver acc_env.sh credential).
#
#   acc_ui.sh shot <archivo.png>   captura de pantalla
#   acc_ui.sh tap "<texto>"        toca el primer nodo cuyo text/content-desc lo contiene
#   acc_ui.sh tapx "<regex>"       igual, con expresión regular sobre text/content-desc
#   acc_ui.sh has "<texto>"        0 si está en pantalla
#   acc_ui.sh texts                textos visibles (filtrados)
#   acc_ui.sh type "<texto>"       teclea (sólo letras, dígitos, espacios, punto y coma)
#   acc_ui.sh key <código>         tecla (4 = Atrás)
#   acc_ui.sh xy <x> <y> | swipe <x1> <y1> <x2> <y2>
set -uo pipefail
export MSYS_NO_PATHCONV=1
SERIAL=${ACC_SERIAL:-emulator-5558}; PKG=com.comunidad.agro.agroquimicos.cierre
a() { adb -s "$SERIAL" "$@"; }
guard() {
  local fg; fg=$(a shell dumpsys window | tr -d '\r' | grep -m1 -E 'mCurrentFocus=' | sed -E 's/.* u[0-9]+ ([^/ }]+).*/\1/')
  [ "$fg" = "$PKG" ] || { echo "ABORTADO: en primer plano está '${fg:-nada}', no $PKG"; exit 1; }
}
dump() { a exec-out uiautomator dump /dev/tty 2>/dev/null | tr -d '\r' | grep -o '<?xml.*</hierarchy>'; }
find_xy() {
  python -I -X utf8 -c '
import sys, re, html
xml, needle, mode = sys.stdin.read(), sys.argv[1], sys.argv[2]
for node in re.findall(r"<node [^>]*>", xml):
    t = html.unescape(re.search(r" text=\"([^\"]*)\"", node).group(1))
    d = html.unescape(re.search(r" content-desc=\"([^\"]*)\"", node).group(1))
    ok = (re.search(needle, t) or re.search(needle, d)) if mode == "re" else (needle in t or needle in d)
    if ok:
        x1, y1, x2, y2 = map(int, re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", node).groups())
        print((x1 + x2) // 2, (y1 + y2) // 2); sys.exit(0)
sys.exit(1)' "$1" "$2"
}
cmd=${1:-}; shift || true
case "$cmd" in
  shot) guard; a exec-out screencap -p > "${1:?archivo}" ;;
  tap) guard; xy=$(dump | find_xy "$1" plain) || { echo "no encontrado: $1"; exit 1; }; guard; a shell input tap $xy; echo "tocado: $1 ($xy)" ;;
  tapx) guard; xy=$(dump | find_xy "$1" re) || { echo "no encontrado: $1"; exit 1; }; guard; a shell input tap $xy; echo "tocado: $1 ($xy)" ;;
  has) guard; dump | find_xy "$1" plain > /dev/null ;;
  texts)
    guard; dump | python -I -X utf8 -c '
import sys, re, html
xml = sys.stdin.read()
nodes = re.findall(r"<node [^>]*>", xml)
for n in nodes:
    if "password=\"true\"" in n and re.search(r" text=\"[^\"]+\"", n):
        print("ABORTADO: hay un campo de contraseña con texto"); sys.exit(1)
for n in nodes:
    t = html.unescape(re.search(r" text=\"([^\"]*)\"", n).group(1)).strip()
    d = html.unescape(re.search(r" content-desc=\"([^\"]*)\"", n).group(1)).strip()
    b = re.search(r"bounds=\"([^\"]*)\"", n).group(1)
    for s in (t, d):
        if s:
            s = re.sub(r"[A-Z0-9_-]{12,}|(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{16,}", "<oculto>", s).replace("\n", " / ")
            print(f"{b} {s[:160]}")
' ;;
  type) guard; [[ "$1" =~ ^[A-Za-z0-9\ .,]*$ ]] || { echo "ABORTADO: caracteres no permitidos"; exit 1; }; a shell input text "${1// /%s}" ;;
  key) guard; a shell input keyevent "${1:?código}" ;;
  xy) guard; a shell input tap "${1:?x}" "${2:?y}" ;;
  swipe) guard; a shell input swipe "$1" "$2" "$3" "$4" 400 ;;
  *) sed -n 2,16p "$0"; exit 2 ;;
esac
