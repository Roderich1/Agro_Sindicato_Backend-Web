/**
 * Recorrido Web de P-A (E2 §12) en el entorno AISLADO (5175 → 3350). Edge sin interfaz. Datos
 * sintéticos; contraseñas de un solo uso fijadas en la base aislada y nunca impresas.
 *   node web_pa.mjs <outDir> permiso                      Administración PA 2 concede «Sustituir responsable» a Directiva DEMO
 *   node web_pa.mjs <outDir> sustituir <convocatoria>     Directiva DEMO sustituye a la responsable inhabilitada por Sucesora PA
 *   node web_pa.mjs <outDir> sucesora <convocatoria>      Sucesora PA: restricción, revisión (confirma Admin, retira Directiva)
 *   node web_pa.mjs <outDir> ver <convocatoria> <clave>   detalle tal como lo ve esa persona
 *   node web_pa.mjs <outDir> excel <propuesta>            descarga el Excel del borrador (referencia fijada)
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL.
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [outDir = '.', action = 'ver', arg1 = '', arg2 = ''] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5175', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const backRequire = createRequire(join(BE_DIR, 'Back', 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const bcrypt = backRequire('bcrypt');
const dbUrl = (() => { const u = new URL(DEMO_PG_ADMIN_URL); u.pathname = '/agro_demo'; return u.toString(); })();
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = {
  admin: 'admin.demo@example.test',
  directiva: 'directiva.demo@example.test',
  suc: 'sucesora.pa@example.test',
  admin2: 'admin2.pa@example.test',
  resp: 'responsable.pa@example.test',
};
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 90000 });
const result = { action, at: new Date().toISOString(), shots: [] };

let sessions = 0;
async function session(key) {
  if (sessions++ > 0) await sleep(20000);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1366, height: 900 });
  const api = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (/^\/api\/v1\/(joint-purchase|collective)/.test(u.pathname)) api.push(`${r.request().method()} ${u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>')} → ${r.status()}`);
  });
  const password = randomBytes(18).toString('base64url');
  await db.user.update({ where: { email: EMAIL[key] }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', EMAIL[key]);
  await page.type('#password', password);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  return { page, api, key };
}
async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  result.shots.push(name);
}
async function openCall(page, name) {
  await page.goto(`${WEB_URL}/colectivo/compras-conjuntas`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  for (const a of await page.$$('a')) if ((await a.evaluate((e) => e.textContent ?? '')).includes(name)) { await a.click(); await sleep(3500); return; }
  throw new Error(`convocatoria «${name}» no encontrada`);
}
async function clickByText(page, re, selector = 'button') {
  for (const h of await page.$$(selector)) {
    const t = await h.evaluate((e) => (e.getAttribute('aria-label') || e.textContent || '').trim());
    if (re.test(t) && !(await h.evaluate((e) => e.disabled))) { await h.click(); await sleep(1200); return t; }
  }
  throw new Error(`sin botón ${re}`);
}
const text = (page, sel) => page.$eval(sel, (e) => e.textContent?.trim() ?? '').catch(() => null);
async function selectByLabel(page, selectId, re) {
  await page.waitForFunction((id) => document.querySelectorAll(`#${id} option`).length > 1, { timeout: 15000 }, selectId);
  const value = await page.$$eval(`#${selectId} option`, (opts, src) => opts.find((o) => new RegExp(src).test(o.textContent ?? ''))?.value ?? '', re.source);
  if (!value) throw new Error(`opción ${re} no encontrada`);
  await page.select(`#${selectId}`, value);
  await sleep(500);
}
async function checkDialogBox(page) {
  const boxes = await page.$$('[role="dialog"] input[type="checkbox"]');
  await boxes[boxes.length - 1].click();
  await sleep(400);
}

try {
  if (action === 'permiso') {
    const s = await session('admin2');
    await s.page.goto(`${WEB_URL}/colectivo/compras-conjuntas`, { waitUntil: 'networkidle0' });
    await sleep(1500);
    await s.page.$eval('[data-testid="substitution-permissions"] summary', (e) => e.click());
    await sleep(1000);
    await shot(s.page, 'pa_w01_permiso_antes');
    await s.page.click('[data-testid="substitution-grant-button"]');
    await sleep(1200);
    await selectByLabel(s.page, 'substitution-user', /Directiva DEMO/);
    await s.page.type('#substitution-reason', 'Coordinar convocatorias si una responsable deja de estar habilitada');
    await checkDialogBox(s.page);
    await shot(s.page, 'pa_w02_permiso_dialogo');
    await clickByText(s.page, /^Conceder el permiso$/, '[role="dialog"] button');
    await sleep(1500);
    await s.page.$$eval('[data-testid="substitution-history"]', (els) => els.forEach((e) => { e.open = true; }));
    await shot(s.page, 'pa_w03_permiso_concedido');
    result.holders = await s.page.$$eval('[data-testid^="substitution-holder-"]', (rows) => rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim()));
    result.api = s.api;
  } else if (action === 'sustituir') {
    const s = await session('directiva');
    await openCall(s.page, arg1);
    result.ineligible = await text(s.page, '[data-testid="responsible-ineligible"]');
    result.closeButton = await s.page.$$eval('button', (bs) => bs.some((b) => b.textContent?.trim() === 'Cerrar'));
    await shot(s.page, 'pa_w04_inhabilitada');
    await clickByText(s.page, /^Sustituir responsable$/);
    await selectByLabel(s.page, 'substitute-user', /Sucesora PA/);
    await s.page.type('#substitute-reason', 'La responsable dejó de estar habilitada; coordina la entrega la sucesora');
    await checkDialogBox(s.page);
    await shot(s.page, 'pa_w05_sustituir_dialogo');
    await clickByText(s.page, /^Sustituir responsable$/, '[role="dialog"] button');
    await sleep(3000);
    result.change = await text(s.page, '[data-testid="responsible-change"]');
    await s.page.$$eval('[data-testid="call-history"]', (els) => els.forEach((e) => { e.open = true; }));
    await shot(s.page, 'pa_w06_sustituida');
    result.api = s.api;
  } else if (action === 'sucesora') {
    const s = await session('suc');
    await openCall(s.page, arg1);
    result.pendingReviews = await text(s.page, '[data-testid="pending-delegation-reviews"]');
    result.pendingAuthorization = await text(s.page, '[data-testid="pending-authorization-notice"]');
    result.totals = await s.page.$$eval('[data-testid="hidden-total"]', (els) => els.map((e) => e.textContent?.trim()));
    result.participantRows = (await s.page.$$('[data-testid="participant-row"]')).length;
    await shot(s.page, 'pa_w07_sucesora_restringida');
    await clickByText(s.page, /^Confirmar «Consultar participantes y cantidades» de /);
    await checkDialogBox(s.page);
    await shot(s.page, 'pa_w08_confirmar_dialogo');
    await clickByText(s.page, /^Confirmar permiso$/, '[role="dialog"] button');
    await sleep(2500);
    await clickByText(s.page, /^Retirar «Administrar la convocatoria» a /);
    await checkDialogBox(s.page);
    await clickByText(s.page, /^Retirar permiso$/, '[role="dialog"] button');
    await sleep(2500);
    await s.page.$$eval('[data-testid="access-history"]', (els) => els.forEach((e) => { e.open = true; }));
    await shot(s.page, 'pa_w09_revisadas');
    result.access = await s.page.$$eval('[data-testid="access-history-event"]', (els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()));
    result.api = s.api;
  } else if (action === 'ver') {
    const s = await session(arg2);
    await openCall(s.page, arg1);
    result.facts = await text(s.page, '[data-testid="call-facts"]');
    result.pendingAuthorization = await text(s.page, '[data-testid="pending-authorization-notice"]');
    result.totals = await s.page.$$eval('[data-testid="hidden-total"]', (els) => els.map((e) => e.textContent?.trim()));
    result.participants = await s.page.$$eval('[data-testid="participant-row"] td:first-child', (els) => els.map((e) => e.textContent?.trim()).filter(Boolean));
    await shot(s.page, `pa_w10_ver_${arg2}`);
    result.api = s.api;
  } else if (action === 'excel') {
    const s = await session('directiva');
    const client = await s.page.createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: resolve(outDir) });
    await s.page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${arg1}`, { waitUntil: "networkidle0" });
    await s.page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Descargar Excel"), { timeout: 30000 });
    await sleep(3000);
    await shot(s.page, 'pa_x01_borrador');
    await clickByText(s.page, /^Descargar Excel$/);
    await sleep(5000);
    result.api = s.api;
  }
} catch (error) {
  result.error = String(error.message).slice(0, 300);
} finally {
  writeFileSync(join(outDir, `web_pa_${action}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 1));
  await browser.close();
  await db.$disconnect();
}
