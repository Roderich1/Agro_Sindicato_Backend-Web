/**
 * Gestión → Productos con datos sintéticos (Edge sin interfaz, copia aislada de la DEMO):
 *  1. Directiva: abre «Productos» desde el menú, crea un producto con nombre y unidad,
 *     comprueba que aparece en el listado, prueba el aviso de nombre repetido e inactiva el
 *     producto de prueba con confirmación (queda bajo «Ver inactivos»).
 *  2. Agricultor: intenta abrir /colectivo/productos (debe ir al aviso) y crear por API
 *     `POST /inventory/products` (debe recibir 403); comprueba que nada se creó.
 *
 *   node productos-roles.mjs <carpeta de salida>
 *
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL, DEMO_API.
 * Las contraseñas de un solo uso llegan por `password-pipe` y no se imprimen ni se guardan.
 * Entre la parte de la Directiva y la del Agricultor espera 70 s: /auth/login está limitado.
 * El Agricultor usa un contexto de navegador propio (sin las cookies de la Directiva).
 * `ONLY=agricultor` repite sólo la segunda parte, sin crear otro producto.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5198', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_API = 'http://127.0.0.1:3340/api/v1', ONLY } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const failures = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};
const check = (ok, what) => {
  say(`${ok ? 'OK ' : 'FALLA'} ${what}`);
  if (!ok) failures.push(what);
};
const passwordOf = (key) =>
  execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', key], {
    cwd: join(BE_DIR, 'Back'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
const PRODUCT = `Adherente prueba Web ${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;

async function login(page, email, password) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', password);
  const [response] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  if (![200, 201].includes(response.status())) throw new Error(`login respondió ${response.status()}`);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  await sleep(2000);
}

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, userDataDir: join(outDir, 'perfil-productos'), defaultViewport: { width: 1366, height: 768 }, args: ['--lang=es-BO'], protocolTimeout: 60000 });

let page;
/* ── 1. Directiva ── */
if (ONLY !== 'agricultor') {
page = await browser.newPage();
await page.setBypassServiceWorker(true);
await login(page, 'directiva.demo@example.test', passwordOf('directiva'));
const menu = await page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((a) => a.innerText.trim()).filter((v, i, all) => all.indexOf(v) === i));
say(`menú: ${menu.join(' | ')}`);
check(menu.indexOf('Productos') >= 0 && menu.indexOf('Productos') === menu.indexOf('Campañas') - 1, 'Directiva: «Productos» en Gestión, antes de Campañas');
await page.evaluate(() => [...document.querySelectorAll('aside nav a[href="/colectivo/productos"]')].pop().click());
await sleep(2500);
check(page.url().endsWith('/colectivo/productos'), `Directiva: abre ${new URL(page.url()).pathname}`);
const before = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="product-"]')].map((r) => r.dataset.testid.slice(8)));
say(`activos antes: ${before.join(', ')}`);
await page.screenshot({ path: join(outDir, '8-productos-1366x768.png') });

const clickText = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  }, text);

// Nombre repetido: aviso y botón deshabilitado.
await clickText('Nuevo producto');
await sleep(500);
await page.type('#product-name', (before[0] ?? 'Herbicida DEMO').toUpperCase());
await page.click('input[name="product-unit"][value="L"]');
await sleep(300);
const clash = await page.evaluate(() => ({
  alert: document.querySelector('#product-name-clash')?.textContent ?? null,
  disabled: [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Crear producto')?.disabled ?? null,
}));
check(Boolean(clash.alert) && clash.disabled === true, `Directiva: nombre repetido avisado y bloqueado («${clash.alert}»)`);

// Alta real.
await page.click('#product-name', { clickCount: 3 });
await page.keyboard.press('Backspace');
await page.type('#product-name', PRODUCT);
await page.evaluate(() => { const d = document.querySelector('form[aria-label="Nuevo producto"] details'); if (d) d.open = true; });
await page.type('#product-category', 'Coadyuvante');
await page.screenshot({ path: join(outDir, '8b-productos-nuevo-1366x768.png') });
const [created] = await Promise.all([
  page.waitForResponse((r) => r.url().endsWith('/inventory/products') && r.request().method() === 'POST', { timeout: 15000 }),
  clickText('Crear producto'),
]);
check(created.status() === 201 || created.status() === 200, `Directiva: POST /inventory/products → ${created.status()}`);
await sleep(2000);
const row = await page.evaluate((name) => document.querySelector(`[data-testid="product-${name}"]`)?.innerText.replace(/\s+/g, ' ') ?? null, PRODUCT);
check(row !== null && /\bL\b/.test(row) && /Coadyuvante/.test(row), `Directiva: «${PRODUCT}» aparece en el listado (${row})`);
await page.screenshot({ path: join(outDir, '8c-productos-creado-1366x768.png') });

// Inactivar con confirmación (deja la copia sin un producto de prueba activo).
await page.evaluate((name) => [...document.querySelector(`[data-testid="product-${name}"]`).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Inactivar').click(), PRODUCT);
await sleep(500);
const confirmShown = await page.evaluate(() => document.body.innerText.includes('No se borra'));
check(confirmShown, 'Directiva: «Inactivar» pide confirmación');
await Promise.all([page.waitForResponse((r) => r.url().includes('/deactivate'), { timeout: 15000 }), clickText('Confirmar inactivación')]);
await sleep(2000);
const inactive = await page.evaluate((name) => ({
  active: Boolean(document.querySelector(`[data-testid="product-${name}"]`)),
  inactive: Boolean(document.querySelector(`[data-testid="inactive-${name}"]`)),
}), PRODUCT);
check(!inactive.active && inactive.inactive, 'Directiva: el producto pasa a «Ver inactivos»');
await page.close();
say('esperando 70 s por el límite de /auth/login…');
await sleep(70000);
}

/* ── 2. Agricultor (contexto aislado) ── */
const farmerPassword = passwordOf('agricultor1');
const farmerContext = await browser.createBrowserContext();
page = await farmerContext.newPage();
await page.setBypassServiceWorker(true);
await login(page, 'agricultor1.demo@example.test', farmerPassword);
await page.goto(`${WEB_URL}/colectivo/productos`, { waitUntil: 'networkidle0' });
await sleep(1500);
const farmerView = await page.evaluate(() => ({ path: location.pathname, newButton: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Nuevo producto') }));
check(farmerView.path !== '/colectivo/productos' && !farmerView.newButton, `Agricultor: la ruta directa redirige a ${farmerView.path} sin el catálogo`);
await page.screenshot({ path: join(outDir, '8d-productos-agricultor.png') });
await farmerContext.close();

// API: el mismo agricultor intenta crear un producto.
await sleep(15000);
const auth = await fetch(`${DEMO_API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'agricultor1.demo@example.test', password: farmerPassword }) });
const authBody = await auth.json().catch(() => ({}));
const token = authBody.accessToken ?? authBody.access_token ?? authBody.token ?? null;
check(Boolean(token), `Agricultor: login por API → ${auth.status}`);
const FORBIDDEN = `Prohibido prueba agricultor ${Date.now()}`;
const post = await fetch(`${DEMO_API}/inventory/products`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: FORBIDDEN, unit: 'L' }) });
check(post.status === 403, `Agricultor: POST /inventory/products → ${post.status}`);
const list = await fetch(`${DEMO_API}/inventory/products?search=${encodeURIComponent('Prohibido prueba agricultor')}`, { headers: { authorization: `Bearer ${token}` } });
const found = list.ok ? (await list.json()).filter((p) => p.name === FORBIDDEN) : [];
check(found.length === 0, `Agricultor: nada se creó (búsqueda → ${list.status}, ${found.length} coincidencias)`);

say(`fallos: ${failures.length}`);
writeFileSync(join(outDir, 'productos-roles.log'), log.join('\n') + '\n');
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
