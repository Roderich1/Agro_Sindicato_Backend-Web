/**
 * Recorrido de la defensa en Edge sin interfaz, ventana baja:
 * Resumen → Borrador → Excel → Historial → Estimación → Agricultores (más Campañas y
 * Reconciliación). Navega dentro de la SPA (sin recargas: /auth/refresh está limitado a 5 por
 * minuto) y, en cada vista, mide el desplazamiento, la última acción alcanzable, el estado del
 * botón «Descargar Excel» y las cifras grandes; guarda una captura completa y otra de la ventana.
 *
 *   node recorrido-defensa.mjs <alto en px> <carpeta de salida>
 *
 * Entorno: WEB_URL (http://127.0.0.1:5197), BROWSER_PATH, PUPPETEER_HOME (carpeta con
 * node_modules/puppeteer-core), BE_DIR (worktree con tool/demo/demo-central.cjs y Back/),
 * DEMO_PG_ADMIN_URL y DEMO_API de la copia sintética. La contraseña de un solo uso de la
 * Directiva llega por la tubería `password-pipe` y no se imprime ni se guarda.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [height = '650', outDir = '.'] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5197', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  userDataDir: join(outDir, 'perfil-defensa'),
  defaultViewport: { width: 1366, height: Number(height) },
  args: ['--lang=es-BO'],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
if (page.url().endsWith('/login')) {
  await page.type('#email', 'directiva.demo@example.test');
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', 'directiva'], {
    cwd: join(BE_DIR, 'Back'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
}
await sleep(2500);
const menu = await page.evaluate(() => [...new Set([...document.querySelectorAll('aside nav a')].map((a) => a.innerText.trim()))]);
say(`menú: ${menu.join(' | ')}`);

const go = async (path) => {
  const ok = await page.evaluate((p) => {
    const links = [...document.querySelectorAll(`a[href="${p}"]`)];
    const link = links[links.length - 1];
    if (!link) return false;
    link.click();
    return true;
  }, path);
  if (!ok) throw new Error(`no hay enlace a ${path}`);
  await sleep(2500);
};
const clickText = (text, nth = 0) =>
  page.evaluate((t, n) => {
    const target = [...document.querySelectorAll('button, a')].filter((x) => x.textContent.trim() === t)[n];
    if (!target) return false;
    target.click();
    return true;
  }, text, nth);
const openDetails = (selector) => page.evaluate((s) => document.querySelectorAll(s).forEach((d) => { d.open = true; }), selector);
const check = async (name) => {
  const r = await page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo(0, 0);
    window.scrollTo(0, 1e6);
    const bottom = window.scrollY;
    const actions = [...document.querySelectorAll('main button, main a, main summary')].filter((el) => el.getBoundingClientRect().height > 0);
    const lowest = actions.reduce((best, el) => (!best || el.getBoundingClientRect().bottom > best.getBoundingClientRect().bottom ? el : best), null);
    const rect = lowest ? lowest.getBoundingClientRect() : null;
    const excel = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Descargar Excel');
    const out = {
      path: location.pathname,
      h1: document.querySelector('h1')?.innerText,
      innerH: window.innerHeight,
      scrollH: root.scrollHeight,
      bottom,
      lowestAction: lowest?.textContent.trim().slice(0, 40),
      lowestVisibleAtBottom: rect ? rect.top >= 0 && rect.bottom <= window.innerHeight : null,
      excel: excel ? `${excel.disabled ? 'deshabilitado' : 'activo'} · ${excel.title}` : 'no hay',
      figures: [...document.querySelectorAll('.text-2xl, .text-3xl')].map((el) => el.textContent.trim()).filter(Boolean).slice(0, 8),
    };
    window.scrollTo(0, 0);
    return out;
  });
  say(`${name}: ${JSON.stringify(r)}`);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  await page.screenshot({ path: join(outDir, `${name}-ventana.png`), fullPage: false });
};

await go('/colectivo/resumen');
await check('1-resumen');
if (!(await clickText('Revisar borrador'))) throw new Error('sin «Revisar borrador»');
await sleep(3500);
await check('2-borrador');
await openDetails('details[aria-label="Historial de borradores"]');
await sleep(500);
await check('2b-borrador-historial');
await go('/colectivo/tendencias');
await check('3-historial');
await page.select('#trend-type', 'CONSUMPTION_TOTAL');
await sleep(2500);
await check('3c-historial-consumo');
await openDetails('details[data-testid="sources"]');
await sleep(500);
await check('3b-historial-fuentes');
await go('/colectivo/estimacion');
await check('4-estimacion');
await openDetails('main details');
await sleep(500);
await check('4b-estimacion-calculo');
await go('/colectivo/cobertura');
await check('5-agricultores');
await go('/campaigns');
await check('6-campanas');
await go('/colectivo/reconciliacion');
await check('7-reconciliacion');
writeFileSync(join(outDir, 'recorrido-defensa.log'), log.join('\n') + '\n');
await browser.close();
