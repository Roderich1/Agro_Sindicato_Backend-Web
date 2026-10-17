/**
 * F07-WEB-01 (#23): recorrido de la Web compilada con el dataset sintético D4
 * (Back/scripts/f07-synthetic-seed.cjs) y la API real.
 *
 *   node walk.mjs <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD (sólo en el proceso), CAMPAIGN_ID,
 * BROWSER_PATH. Comprueba que un AGRICULTOR no recibe menú ni datos en la Web,
 * que la cola offline legacy no se usa, que una acción sin conexión no se
 * encola y que la Directiva conserva su menú. No imprime secretos.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../f10_eval_web/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, CAMPAIGN_ID, BROWSER_PATH } = process.env;
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], defaultViewport: { width: 1366, height: 768 } });
const version = await browser.version();
const page = await browser.newPage();
const shot = async (name) => { await sleep(400); await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }); };
const QUEUE_KEYS = ['agro_offline_queue_v2', 'agro_offline_queue_v1'];
const queue = () => page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)).filter((v) => v !== null), QUEUE_KEYS);

async function login(email) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', WALK_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}
async function logout() {
  for (const button of await page.$$('xpath/.//button[contains(., "Cerrar sesión")]')) {
    if (await button.boundingBox()) { await button.click(); break; }
  }
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
}
const visibleNav = () => page.$$eval('nav a', (links) => links.filter((a) => a.offsetParent !== null).map((a) => a.textContent.trim()));

try {
  // 1. AGRICULTOR: aviso, sin menú ni datos; ninguna ruta legacy le sirve pantallas.
  await login('f1@f07.example.test');
  check('AGRICULTOR entra al aviso', page.url().endsWith('/sin-acceso-web'), page.url());
  check('AGRICULTOR sin menú ni enlaces', (await visibleNav()).length === 0, (await visibleNav()).join(' | '));
  check('El aviso remite a la app móvil', (await page.content()).includes('se registran en la app móvil'));
  await shot('01-agricultor-aviso');
  for (const path of ['/', '/dashboard', '/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/campaigns', '/calendar', '/users', '/audit-logs', '/colectivo/resumen', '/directiva']) {
    await page.goto(`${WEB_URL}${path}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/sin-acceso-web' || location.pathname.startsWith('/colectivo/propuestas'), { timeout: 10000 }).catch(() => undefined);
    const landed = new URL(page.url()).pathname;
    // /directiva redirige a la propuesta, que a su vez lleva al aviso.
    check(`AGRICULTOR en ${path} termina en el aviso`, landed === '/sin-acceso-web', landed);
  }
  check('Ninguna cola offline legacy en localStorage (AGRICULTOR)', (await queue()).length === 0, JSON.stringify(await queue()));
  await logout();

  // 2. DIRECTIVA: menú institucional congelado.
  await login('directiva@f07.example.test');
  check('DIRECTIVA entra al resumen colectivo', page.url().includes('/colectivo/resumen'), page.url());
  const menu = await visibleNav();
  check('Menú de DIRECTIVA sin operación del agricultor', !menu.some((m) => /Inventario|Parcelas|Aplicaciones|Compras|Sincroniz/i.test(m)), menu.join(' | '));
  await shot('02-directiva-resumen');

  // 3. Sin conexión: generar un borrador no se envía ni se encola; se informa.
  await page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${CAMPAIGN_ID}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('xpath/.//button[contains(., "Generar propuesta (borrador)")]', { timeout: 15000 });
  const before = await fetch(`${API_URL}/api/v1/health`).then((r) => r.status);
  await page.setOfflineMode(true);
  const [generate] = await page.$$('xpath/.//button[contains(., "Generar propuesta (borrador)")]');
  await generate.click();
  await page.waitForFunction(() => document.body.textContent.includes('Sin conexión con el servidor'), { timeout: 10000 }).catch(() => undefined);
  const body = await page.evaluate(() => document.body.textContent);
  check('Sin conexión: se informa la falta de conectividad', body.includes('Sin conexión con el servidor') && body.includes('no guarda operaciones para después'), body.slice(0, 200));
  check('Sin conexión: nada queda en una cola', (await queue()).length === 0, JSON.stringify(await queue()));
  await shot('03-directiva-sin-conexion');
  await page.setOfflineMode(false);
  check('API disponible durante la prueba (el corte fue sólo del navegador)', before === 200, before);
  await logout();

  // 4. PWA: manifiesto de la Directiva; el service worker no cachea el API.
  const manifest = await fetch(`${WEB_URL}/manifest.webmanifest`).then((r) => r.json());
  check('Manifiesto PWA de la Directiva', manifest.name === 'Agrocuentas Directiva' && !/agricultores\./.test(manifest.description), `${manifest.name} — ${manifest.description}`);
  const sw = await fetch(`${WEB_URL}/sw.js`).then((r) => r.text());
  check('El service worker no tiene rutas del API', !sw.includes('/api'), sw.includes('/api') ? 'contiene /api' : 'sin /api');
} catch (error) {
  await page.screenshot({ path: join(out, 'error.png'), fullPage: true }).catch(() => undefined);
  check('Recorrido completo sin excepción', false, `${page.url()} — ${String(error.message).split('\n')[0]}`);
}
await browser.close();
const result = checks.every((c) => c.ok) ? 'CUMPLE' : 'NO CUMPLE';
writeFileSync(join(out, 'walk.json'), `${JSON.stringify({ browser: version, date: new Date().toISOString(), result, checks }, null, 2)}\n`);
process.stdout.write(`F07-WEB-01 (${version}): ${result} (${checks.filter((c) => c.ok).length}/${checks.length})\n`);
for (const c of checks.filter((c) => !c.ok)) process.stdout.write(`  NO CUMPLE: ${c.name} — ${c.detail}\n`);
