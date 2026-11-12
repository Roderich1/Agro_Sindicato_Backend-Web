// Teclea en el emulador una contraseña de UN solo uso de la Central ET1, por partes (el
// teclado del emulador pierde caracteres si llegan de golpe). La contraseña se obtiene por
// tubería (`demo-rica.cjs password-pipe`), vive sólo en memoria de este proceso y nunca se
// imprime. Sólo actúa si el campo enfocado del paquete .et1 es de contraseña.
//   node type_password.cjs <rol> [serial]      (desde Back/, con DEMO_PG_ADMIN_URL y DEMO_API)
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");

const [role, serial = "emulator-5554"] = process.argv.slice(2);
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Paquete aislado (por defecto .et1; ET1_PKG para otra instalación aislada, p. ej. .et1u).
const PKG = process.env.ET1_PKG || "com.comunidad.agro.agroquimicos.et1";

(async () => {
  const focus = adb("shell", "dumpsys", "window").split("\n").find((l) => l.includes("mCurrentFocus=")) ?? "";
  if (!focus.includes(`${PKG}/`)) throw new Error(`ABORTADO: el primer plano no es ${PKG}`);
  const dump = adb("exec-out", "uiautomator", "dump", "/dev/tty");
  const field = (dump.match(/<node[^>]*>/g) ?? []).find((n) => n.includes('class="android.widget.EditText"') && n.includes('focused="true"'));
  if (!field || !field.includes('password="true"')) throw new Error("ABORTADO: el campo enfocado no es de contraseña");
  const password = execFileSync(process.execPath, [resolve(__dirname, "../demo-rica/demo-rica.cjs"), "password-pipe", role], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  for (let i = 0; i < password.length; i += 3) {
    adb("shell", "input", "text", password.slice(i, i + 3));
    await sleep(350);
  }
  console.log(`contraseña de un solo uso de ${role} tecleada por partes (no se muestra ni se guarda)`);
})().catch((e) => { console.error(String(e.message).slice(0, 120)); process.exit(1); });
