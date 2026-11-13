/**
 * Verificación E4: teclea en el emulador una contraseña NUEVA de un solo uso de
 * una cuenta sintética (E4_LABEL), SÓLO si el campo enfocado es un EditText con
 * password="true" y la app .acc está en primer plano. La contraseña se fija en
 * la base y se teclea dentro de este proceso: nunca se imprime ni se guarda.
 *   node credential_adb.cjs <F1|…> <serial>
 */
const { execFileSync } = require("node:child_process");
const L = require("./e4_lib.cjs");
const [code, serial] = process.argv.slice(2);
const PKG = "com.comunidad.agro.agroquimicos.acc";
(async () => {
  if (!/^[A-Z][0-9]$/.test(code ?? "") || !/^emulator-5558$/.test(serial ?? "")) throw new Error("uso: <F1|…> emulator-5558");
  const focus = execFileSync("adb", ["-s", serial, "shell", "dumpsys", "window"], { encoding: "utf8" }).split("\n").find((l) => l.includes("mCurrentFocus=")) ?? "";
  if (!focus.includes(PKG)) throw new Error("ABORTADO: .acc no está en primer plano");
  const dump = execFileSync("adb", ["-s", serial, "exec-out", "uiautomator", "dump", "/dev/tty"], { encoding: "utf8" });
  const focused = (dump.match(/<node[^>]*>/g) ?? []).find((n) => n.includes('class="android.widget.EditText"') && n.includes('focused="true"'));
  if (!focused || !focused.includes('password="true"')) throw new Error("ABORTADO: el campo enfocado no es de contraseña");
  const password = await L.oneTimePassword(L.emailOf(code));
  execFileSync("adb", ["-s", serial, "shell", "input", "text", password]);
  console.log(`contraseña de un solo uso de ${code} tecleada en el campo de contraseña (no se muestra ni se guarda)`);
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => L.db.$disconnect());
