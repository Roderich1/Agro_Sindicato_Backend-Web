// Ayudante del emulador para recorridos del entorno AISLADO (sin secretos): lista los textos
// visibles, toca por texto o clave, captura pantalla. Nunca lee ni imprime campos de contraseña
// (uiautomator los expone: se filtran). Sólo actúa si el primer plano es el paquete indicado.
//   node ui.cjs texts                 textos y descripciones visibles (sin contraseñas)
//   node ui.cjs tap <regex> [n]       toca el n-ésimo nodo (0 por defecto) cuyo texto o descripción coincide
//   node ui.cjs shot <archivo.png>    captura
// Entorno: UI_PKG (paquete), UI_SERIAL (emulator-5554).
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");

const PKG = process.env.UI_PKG || "com.comunidad.agro.agroquimicos.et1o";
const SERIAL = process.env.UI_SERIAL || "emulator-5554";
const adb = (args, opts = {}) => execFileSync("adb", ["-s", SERIAL, ...args], { encoding: opts.binary ? "buffer" : "utf8", timeout: 30000, maxBuffer: 64 << 20 });
const [cmd, arg, nth] = process.argv.slice(2);

function foreground() {
  const focus = adb(["shell", "dumpsys", "window"]).split("\n").find((l) => l.includes("mCurrentFocus=")) ?? "";
  if (!focus.includes(`${PKG}/`)) throw new Error(`ABORTADO: el primer plano no es ${PKG}`);
}
function nodes() {
  const dump = adb(["exec-out", "uiautomator", "dump", "/dev/tty"]);
  return (dump.match(/<node[^>]*>/g) ?? [])
    .filter((n) => !n.includes('password="true"'))
    .map((n) => {
      const attr = (k) => (n.match(new RegExp(`${k}="([^"]*)"`)) ?? [])[1] ?? "";
      const b = attr("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      const dec = (s) => s.replace(/&#10;/g, " / ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      return { text: dec(attr("text")), desc: dec(attr("content-desc")), cls: attr("class"), enabled: attr("enabled") === "true", checked: attr("checked") === "true", x: b ? (+b[1] + +b[3]) >> 1 : 0, y: b ? (+b[2] + +b[4]) >> 1 : 0 };
    })
    .filter((n) => n.text || n.desc);
}

try {
  foreground();
  if (cmd === "texts") {
    for (const n of nodes()) console.log(`${n.enabled ? "" : "[off] "}${n.checked ? "[x] " : ""}${n.text || n.desc}`);
  } else if (cmd === "tap") {
    const re = new RegExp(arg);
    const hits = nodes().filter((n) => re.test(n.text) || re.test(n.desc));
    const hit = hits[Number(nth ?? 0)];
    if (!hit) throw new Error(`sin nodo ${arg}`);
    adb(["shell", "input", "tap", String(hit.x), String(hit.y)]);
    console.log(`tap «${(hit.text || hit.desc).slice(0, 60)}»`);
  } else if (cmd === "shot") {
    writeFileSync(arg, adb(["exec-out", "screencap", "-p"], { binary: true }));
    console.log(`captura ${arg}`);
  }
} catch (e) {
  console.error(String(e.message).slice(0, 160));
  process.exit(1);
}
