/**
 * Recorrido del orquestador (rediseño Web v2): por rol y ruta, en 1440 y 390 px, contra la Web de
 * revisión (WEB_URL, por defecto 5177) y la API aislada 3350 con datos sintéticos. No captura
 * imágenes: registra la ruta final, los h1, los errores de consola, las llamadas a la API con
 * estado ≥ 400, las escrituras (no GET) disparadas al cargar y el desplazamiento horizontal.
 * Contraseñas de un solo uso, como capture_base.mjs; nunca se imprimen.
 *   node recorrido_o.mjs <salida.json>
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL (tool/etapa3/e3env.sh de ET2-BE).
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outFile] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5177', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const backRequire = createRequire(join(BE_DIR, 'Back', 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const bcrypt = backRequire('bcrypt');
const dbUrl = (() => { const u = new URL(DEMO_PG_ADMIN_URL); u.pathname = '/agro_demo'; return u.toString(); })();
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = { admin: 'admin.demo@example.test', directiva: 'directiva.demo@example.test', agricultor: 'agricultor3.demo@example.test' };
const ID = /[0-9a-f]{8}-[0-9a-f-]{27}/g;

const COMMON = [
  '/colectivo/resumen', '/colectivo/cobertura', '/colectivo/propuestas', '/colectivo/compras-conjuntas',
  '@call', '/colectivo/catalogo?vista=productos', '/colectivo/catalogo?vista=equivalencias',
  '/colectivo/catalogo?vista=identificacion', '/colectivo/historico?vista=tendencias', '/colectivo/historico?vista=estimacion',
  '/campaigns', '@campaign', '/audit-logs', '/users', '/calendar', '/dashboard', '/directiva', '/colectivo/tendencias',
  '/colectivo/estimacion', '/colectivo/productos', '/estimacion/copia-sin-conexion', '/ruta-que-no-existe',
];
const PLAN = { directiva: COMMON, admin: COMMON, agricultor: ['/colectivo/resumen', '/campaigns', '/users', '/calendar'] };

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 120000 });
const result = [];
let logins = 0;

async function login(role) {
  if (logins++ > 0) await sleep(20000);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateTimezone('America/La_Paz');
  page.log = { errors: [], api: [] };
  page.on('console', (m) => { if (m.type() === 'error') page.log.errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => page.log.errors.push(`pageerror ${String(e.message).slice(0, 200)}`));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) page.log.api.push({ m: r.request().method(), p: u.pathname.replace(ID, '<id>'), s: r.status() });
  });
  const password = randomBytes(18).toString('base64url');
  await db.user.update({ where: { email: EMAIL[role] }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', EMAIL[role]);
  await page.type('#password', password);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  await sleep(2500);
  return page;
}

async function go(page, path) {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(3500);
}

async function firstHref(page, selector) {
  return page.evaluate((s) => { const a = document.querySelector(s); return a ? a.getAttribute('href') : null; }, selector);
}

async function inspect(page, role, asked, width) {
  page.log.errors = []; page.log.api = [];
  await page.setViewport(width === 390 ? { width: 390, height: 844, deviceScaleFactor: 2 } : { width: 1440, height: 900 });
  await go(page, asked);
  const info = await page.evaluate(() => ({
    path: location.pathname + location.search,
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    login: location.pathname === '/login',
  }));
  const writes = page.log.api.filter((c) => c.m !== 'GET' && !/\/auth\//.test(c.p));
  const failed = page.log.api.filter((c) => c.s >= 400);
  result.push({ role, asked: asked.replace(ID, '<id>'), width, ...info, path: info.path.replace(ID, '<id>'), errors: [...page.log.errors], writes, failed, calls: page.log.api.length });
}

for (const role of Object.keys(PLAN)) {
  const page = await login(role);
  for (const entry of PLAN[role]) {
    let path = entry;
    if (entry === '@call') { await go(page, '/colectivo/compras-conjuntas'); path = await firstHref(page, 'a[href^="/colectivo/compras-conjuntas/"]'); }
    if (entry === '@campaign') { await go(page, '/campaigns'); path = await firstHref(page, 'a[href^="/campaigns/"]'); }
    if (!path) { result.push({ role, asked: entry, missing: true }); continue; }
    for (const width of [1440, 390]) await inspect(page, role, path, width);
    if (new URL(page.url()).pathname === '/login') { result.push({ role, asked: path, lostSession: true }); break; }
  }
  await page.browserContext().close();
}
await browser.close();
await db.$disconnect();
writeFileSync(outFile, JSON.stringify(result, null, 1));
const bad = result.filter((r) => r.missing || r.lostSession || r.login || r.overflow > 0 || r.errors?.length || r.writes?.length || r.failed?.length);
console.log(`${result.length} comprobaciones; con observaciones: ${bad.length}`);
for (const r of bad) console.log(JSON.stringify({ role: r.role, asked: r.asked, w: r.width, path: r.path, overflow: r.overflow, errors: r.errors?.length, writes: r.writes, failed: r.failed, missing: r.missing, lost: r.lostSession || r.login }));
