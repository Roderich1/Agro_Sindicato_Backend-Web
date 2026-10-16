/**
 * F10-SEC-02 (#45): recorrido Web corto con datos SINTÉTICOS (Edge headless
 * vía puppeteer-core, instalado aparte; no es dependencia del proyecto).
 *
 *   node walkthrough-f10.mjs <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD (sólo en el proceso), BROWSER_PATH.
 * Usa las cuentas de `Back/scripts/f07-synthetic-seed.cjs`. Escribe capturas
 * PNG y `walkthrough-f10.json` con comprobaciones; no imprime secretos.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, BROWSER_PATH } = process.env;
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--lang=es-BO', '--window-size=1440,1000'],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();

async function shot(name) {
  await sleep(600);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}

async function login(email) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', WALK_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}

async function logout() {
  for (const button of await page.$$('xpath/.//button[contains(., "Cerrar sesión")]')) {
    if (await button.boundingBox()) {
      await button.click();
      break;
    }
  }
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
}

/**
 * Navega en el cliente (como un enlace o la barra de direcciones dentro de la
 * aplicación ya cargada) y espera a que termine de redirigir. Una recarga
 * completa por ruta renovaría la sesión cada vez y superaría el límite de
 * 20 peticiones/min de /auth/refresh.
 */
async function visit(path) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await sleep(300);
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => undefined);
  return new URL(page.url()).pathname;
}

async function apiLogin(email) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: WALK_PASSWORD }),
  });
  return (await res.json()).accessToken;
}

async function api(path, token, method = 'GET', body) {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.text() };
}

const C1 = 'Campaña Verano 2026 (sintética)';

try {
  // 1. Presidente (ADMINISTRADOR): las pantallas de operación privada lo devuelven a su vista colectiva.
  await login('presidente@f07.example.test');
  for (const path of ['/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/dashboard']) {
    const landed = await visit(path);
    check(`ADMINISTRADOR en ${path} vuelve al resumen colectivo`, landed === '/colectivo/resumen', landed);
  }
  const directiva = await visit('/directiva');
  check('ADMINISTRADOR en /directiva llega a la propuesta en borrador', directiva === '/colectivo/propuestas', directiva);
  const body = await page.$eval('body', (b) => b.textContent ?? '');
  check('Sin botón de compra ejecutable ni pagos en /directiva', !/Registrar compra conjunta|Pagar total|Registrar pago/i.test(body));
  await shot('01-presidente-directiva-redirige-a-propuesta');

  // 2. La API, no el menú, decide (presidente con su sesión real).
  const adminToken = await apiLogin('presidente@f07.example.test');
  const globalStock = await api('/inventory/global-stock', adminToken);
  check('API: global-stock cerrada para ADMINISTRADOR (403)', globalStock.status === 403 && globalStock.body.includes('LEGACY_ROUTE_CLOSED'), `${globalStock.status}`);
  const joint = await api('/purchases/joint', adminToken, 'POST', { supplier: {}, paymentMode: 'CONTADO', items: [] });
  check('API: compra conjunta ejecutable cerrada (403)', joint.status === 403, `${joint.status}`);
  const payables = await api('/accounts-payable', adminToken);
  check('API: deudas de agricultores, 403 para ADMINISTRADOR', payables.status === 403, `${payables.status}`);
  const products = await api('/inventory/products', adminToken);
  check('API: catálogo sin currentStock', products.status === 200 && !products.body.includes('currentStock'), `${products.status}`);
  await logout();

  // 3. Directiva: la cobertura de un borrador lleva su fecha; la del resumen es la actual.
  await login('directiva@f07.example.test');
  await page.waitForFunction(
    (wanted) => [...document.querySelectorAll('#campaign-picker option')].some((o) => o.textContent.startsWith(wanted)),
    { timeout: 15000 },
    C1,
  );
  const c1 = await page.$$eval('#campaign-picker option', (options, wanted) => options.find((o) => o.textContent.startsWith(wanted))?.value, C1);
  await visit(`/colectivo/resumen?campaign=${c1}`);
  await page.waitForSelector('[data-testid="coverage"]');
  const summaryCoverage = await page.$eval('[data-testid="coverage"]', (e) => e.textContent ?? '');
  check('Resumen: cobertura actual, sin rótulo histórico', /3 de 4/.test(summaryCoverage) && !/al generar el borrador/.test(summaryCoverage), summaryCoverage);
  await visit(`/colectivo/propuestas?campaign=${c1}`);
  const [generate] = await page.$$('xpath/.//button[normalize-space(.)="Generar propuesta (borrador)"]');
  await generate.click();
  await page.waitForSelector('[data-testid="coverage"]');
  const draftCoverage = await page.$eval('[data-testid="coverage"]', (e) => e.textContent ?? '');
  check(
    'Borrador: cobertura rotulada con su fecha de generación',
    /Cobertura al generar el borrador \(/.test(draftCoverage) && /habían aportado datos en esa fecha/.test(draftCoverage) && /No es la cobertura actual/.test(draftCoverage),
    draftCoverage,
  );
  await shot('02-borrador-cobertura-con-fecha');
  await logout();

  // 4. Agricultor: conserva su pantalla legacy (sin retirada destructiva).
  await login('f1@f07.example.test');
  const inventory = await visit('/inventory');
  check('AGRICULTOR conserva /inventory', inventory === '/inventory', inventory);
  const directivaFarmer = await visit('/directiva');
  check('AGRICULTOR en /directiva no ve la página heredada', directivaFarmer !== '/directiva', directivaFarmer);
  await visit('/inventory');
  await shot('03-agricultor-inventario-legacy');
} catch (error) {
  check('recorrido sin excepciones', false, String(error));
  await page.screenshot({ path: join(out, 'error-f10.png'), fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.ok).length;
writeFileSync(join(out, 'walkthrough-f10.json'), `${JSON.stringify({ when: new Date().toISOString(), passed, total: checks.length, checks }, null, 2)}\n`);
process.stdout.write(`F10 walkthrough: ${passed}/${checks.length}\n`);
