/**
 * Descarga los cuatro libros Excel de la Directiva desde la Web (Edge sin interfaz,
 * copia sintética): Resumen colectivo, Propuesta conjunta, Tendencias y Estimación.
 * Navega dentro de la SPA y pulsa «Descargar Excel» en cada vista; guarda los .xlsx en
 * la carpeta indicada y escribe `descargas.log` con nombre y tamaño de cada archivo.
 *
 *   node descargar-excel.mjs <carpeta de salida>
 *
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL, DEMO_API
 * (como recorrido-panel.mjs). La contraseña llega por `password-pipe` y no se imprime.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5198', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const downloads = resolve(outDir, 'xlsx');
mkdirSync(downloads, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  userDataDir: join(outDir, 'perfil-descargas'),
  defaultViewport: { width: 1366, height: 768 },
  args: ['--lang=es-BO'],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
if (page.url().endsWith('/login')) {
  await page.type('#email', 'directiva.demo@example.test');
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', 'directiva'], {
    cwd: join(BE_DIR, 'Back'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  const [login] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  if (login.status() !== 200 && login.status() !== 201) throw new Error(`login respondió ${login.status()} (¿límite de intentos? espere un minuto)`);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
}
await sleep(2500);

const go = async (path) => {
  const ok = await page.evaluate((p) => {
    const link = [...document.querySelectorAll(`aside nav a[href="${p}"]`)].pop();
    if (!link) return false;
    link.click();
    return true;
  }, path);
  if (!ok) throw new Error(`no hay enlace a ${path}`);
  await sleep(3000);
};
const files = () => readdirSync(downloads).filter((f) => f.endsWith('.xlsx'));
const downloadExcel = async (name) => {
  const before = new Set(files());
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Descargar Excel');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error(`${name}: sin botón «Descargar Excel» activo`);
  let created = null;
  for (let i = 0; i < 40 && !created; i++) {
    await sleep(500);
    created = files().find((f) => !before.has(f)) ?? null;
  }
  if (!created) throw new Error(`${name}: no llegó la descarga`);
  await sleep(500);
  say(`${name}: ${created} (${statSync(join(downloads, created)).size} bytes)`);
};

await go('/colectivo/resumen');
await downloadExcel('Resumen colectivo');
await go('/colectivo/propuestas');
await sleep(2000);
await downloadExcel('Propuesta conjunta');
await go('/colectivo/tendencias');
await downloadExcel('Tendencias (Consumo publicado)');
await go('/colectivo/estimacion');
await downloadExcel('Estimación del consumo');
writeFileSync(join(outDir, 'descargas.log'), log.join('\n') + '\n');
await browser.close();
