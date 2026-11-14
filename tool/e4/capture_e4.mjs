/**
 * Verificación E4 (2026-11-13). Copia adaptada de `tool/web_rediseno_v2/capture_base.mjs`
 * (que apunta a `agro_demo` y a otras cuentas): Web REAL en Vite 5184 → API E4 3400, base
 * `acc_api` (15440), cuentas sintéticas de `Back/scripts/e4-acc-synthetic-walk.cjs` (E4_LABEL).
 *
 * Secretos: cada inicio de sesión fija en la cuenta una contraseña NUEVA de un solo uso, aleatoria
 * y sólo en la memoria de este proceso; se teclea en el campo de contraseña y nunca se imprime ni
 * se captura (las capturas se toman después de entrar). Los tokens no salen del navegador.
 *
 *   node capture_e4.mjs <plan.mjs> <carpeta_capturas>
 * Pasos del plan (`default: [{ role: 'D1'|'A1'|…, steps: [...] }]`), además de los de capture_base:
 *   { apiLog: 'etiqueta' }     imprime y vacía el registro de peticiones a /api/ (método y ruta)
 *   { bodies: 'etiqueta' }     inspecciona TODOS los cuerpos JSON recibidos desde el último `bodies`:
 *                              busca nombres de agricultores (F1–F3) y claves por persona
 *                              (`participants` no nulo, `name` junto a `quantity_base`); imprime el resultado
 *   { download: 'regex', as: 'archivo.xlsx' }  pulsa el botón y guarda la descarga en <carpeta>/descargas
 *   { db: 'deactivate'|'activate'|'role', user: 'A2', role?: 'DIRECTIVA' }  cambio directo en la base
 *                              (sólo para provocar la «consulta siguiente»; se anota en el índice)
 *   { focus: true }            dispara `visibilitychange`/`focus` (comprobación al recuperar el foco)
 * Escribe <carpeta>/_capturas.json y <carpeta>/_registro.json (peticiones y resultados de `bodies`).
 * Entorno: WEB_URL (http://127.0.0.1:5184), BROWSER_PATH, PUPPETEER_HOME, E4_BACK_DIR, E4_LABEL.
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [planFile, outDirArg] = process.argv.slice(2);
const outDir = resolve(outDirArg);
const {
  WEB_URL = 'http://127.0.0.1:5184',
  BROWSER_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  PUPPETEER_HOME = 'C:/Users/MSI/AppData/Local/Temp/agro_demo_web_tools',
  E4_BACK_DIR = 'C:/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro/_wt/ACC-A/Back',
  E4_LABEL = 'VER1',
} = process.env;
if (!/^http:\/\/127\.0\.0\.1:5184$/.test(WEB_URL)) throw new Error('Rechazado: sólo la Web de verificación 5184');
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const backRequire = createRequire(join(E4_BACK_DIR, 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const bcrypt = backRequire('bcrypt');
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres@127.0.0.1:15440/acc_api?schema=public' } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emailOf = (code) => `e4-${E4_LABEL.toLowerCase()}-${code.toLowerCase()}@example.test`;
const FARMER_NAMES = ['F1', 'F2', 'F3'].map((c) => `${c} sintético ${E4_LABEL}`);
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };
const VIEWPORTS = { escritorio: DESKTOP, movil: MOBILE };
const plan = (await import(pathToFileURL(resolve(planFile)).href)).default;
const indexFile = join(outDir, '_capturas.json');
const logFile = join(outDir, '_registro.json');
mkdirSync(outDir, { recursive: true });
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
const registro = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : [];
// Cambios de rol y habilitación por la API real, como la Administración A1 (`admin` en el plan).
const L = createRequire(import.meta.url)('./e4_lib.cjs');
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 120000 });
let logins = 0;
const mask = (p) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>');

async function login(role) {
  if (logins++ > 0) await sleep(15000); // 5 inicios de sesión por minuto en la API
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport(DESKTOP);
  await page.emulateTimezone('America/La_Paz');
  page.apiCalls = [];
  page.bodies = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (u.pathname.startsWith('/api/')) page.apiCalls.push(`${req.method()} ${mask(u.pathname)}${u.search ? mask(u.search) : ''}`); });
  page.on('response', async (res) => {
    const u = new URL(res.url());
    if (!u.pathname.startsWith('/api/') || /\/auth\//.test(u.pathname)) return; // los cuerpos de auth llevan tokens: no se leen
    try {
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      page.bodies.push({ path: `${res.request().method()} ${mask(u.pathname)}`, status: res.status(), text: await res.text() });
    } catch { /* cuerpo no disponible (redirecciones, cancelaciones) */ }
  });
  const password = randomBytes(18).toString('base64url');
  await db.user.update({ where: { email: emailOf(role) }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', emailOf(role));
  await page.type('#password', password);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  await sleep(1500);
  return page;
}

async function clickText(page, re, scope = 'body') {
  const handles = await page.$$(`${scope} button, ${scope} a, ${scope} summary, ${scope} [role="tab"], ${scope} label, ${scope} [role="button"], ${scope} [role="menuitem"]`);
  for (const h of handles) {
    const t = await h.evaluate((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim());
    const visible = await h.evaluate((e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    if (visible && re.test(t) && !(await h.evaluate((e) => e.disabled))) { await h.evaluate((e) => e.scrollIntoView({ block: 'center' })); await h.click(); await sleep(1500); return t; }
  }
  throw new Error(`sin elemento ${re} en ${scope}`);
}

/** Busca en los cuerpos JSON nombres de agricultores y datos por persona. */
function inspectBodies(bodies) {
  const findings = [];
  for (const b of bodies) {
    let json = null;
    try { json = JSON.parse(b.text); } catch { continue; }
    for (const name of FARMER_NAMES) if (b.text.includes(name)) findings.push(`${b.path}: contiene el nombre «${name.split(' ')[0]}»`);
    const walk = (node, trail) => {
      if (Array.isArray(node)) { node.forEach((n, i) => walk(n, `${trail}[${i}]`)); return; }
      if (node && typeof node === 'object') {
        if ('participants' in node && Array.isArray(node.participants) && node.participants.length > 0) findings.push(`${b.path}: ${trail}.participants con ${node.participants.length} filas`);
        if ('name' in node && ('quantity_base' in node || 'lines' in node) && 'participation_ref' in node) findings.push(`${b.path}: ${trail} une nombre y cantidad`);
        for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`);
      }
    };
    walk(json, '$');
  }
  return findings;
}

async function capture(page, step, role) {
  if (!step.allowLogin && new URL(page.url()).pathname === '/login') throw new Error('no se captura: la sesión se perdió');
  const name = step.shot;
  mkdirSync(dirname(join(outDir, name)), { recursive: true });
  const entries = [];
  const sizes = step.sizes ?? ['escritorio', ...(step.mobile !== false ? ['movil'] : [])];
  for (const real of sizes) {
    if (real !== 'escritorio') { await page.setViewport(VIEWPORTS[real]); await sleep(1500); }
    const file = `${name}__${real}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: step.full !== false });
    entries.push(file);
    if (real !== 'escritorio') { await page.setViewport(DESKTOP); await sleep(800); }
  }
  index.push({ files: entries, ruta: mask(new URL(page.url()).pathname), rol: role, desc: step.desc ?? '', at: new Date().toISOString() });
  console.log(`captura ${entries.join(', ')}`);
}

try {
  for (const block of plan) {
    const page = await login(block.role);
    const cdp = await page.createCDPSession();
    const dlDir = join(outDir, 'descargas');
    mkdirSync(dlDir, { recursive: true });
    // La descarga se permite en el contexto de navegador de esta sesión (browserContextId).
    const browserCdp = await browser.target().createCDPSession();
    await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, browserContextId: page.browserContext().id, eventsEnabled: true })
      .catch((e) => console.log(`AVISO descarga: ${e.message}`));
    void cdp;
    for (const step of block.steps) {
      try {
        if (step.goto) {
          if (!page.url().startsWith(WEB_URL) || step.reload) await page.goto(`${WEB_URL}${step.goto}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
          else {
            await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, step.goto);
            await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
          }
          await sleep(step.after ?? 3500);
          if (!step.allowLogin && new URL(page.url()).pathname === '/login') throw new Error('la sesión se perdió (pantalla de inicio de sesión)');
        }
        else if (step.click) await clickText(page, new RegExp(step.click), step.in ?? 'body');
        else if (step.clickSel) { await page.$eval(step.clickSel, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); }); await sleep(1500); }
        else if (step.check) { const boxes = await page.$$(step.check); await boxes[boxes.length - 1].click(); await sleep(500); }
        else if (step.type) { await page.click(step.type[0], { clickCount: 3 }); await page.type(step.type[0], step.type[1]); await sleep(500); }
        else if (step.select) {
          const value = await page.$$eval(`${step.select[0]} option`, (opts, src) => opts.find((o) => new RegExp(src).test(o.textContent ?? ''))?.value ?? '', step.select[1]);
          await page.select(step.select[0], value); await sleep(1200);
        }
        else if (step.wait) await sleep(step.wait);
        else if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 20000 });
        else if (step.open) { await page.$$eval(step.open, (els) => els.forEach((e) => { e.open = true; })); await sleep(800); }
        else if (step.scroll) { await page.$eval(step.scroll, (e) => e.scrollIntoView({ block: 'start' })); await sleep(600); }
        else if (step.apiLog) { const calls = [...page.apiCalls]; console.log(`API ${block.role} ${step.apiLog}: ${JSON.stringify(calls)}`); registro.push({ rol: block.role, apiLog: step.apiLog, calls, participantsRequested: calls.some((c) => /\/participants/.test(c)) }); page.apiCalls.length = 0; }
        else if (step.bodies) {
          const findings = inspectBodies(page.bodies);
          const paths = [...new Set(page.bodies.map((b) => `${b.path} ${b.status}`))];
          console.log(`CUERPOS ${block.role} ${step.bodies}: ${page.bodies.length} respuestas JSON; hallazgos: ${findings.length ? JSON.stringify(findings) : 'ninguno'}`);
          registro.push({ rol: block.role, bodies: step.bodies, responses: page.bodies.length, paths, findings });
          page.bodies.length = 0;
        }
        else if (step.text) {
          const t = await page.evaluate(() => document.body.innerText);
          const hits = (step.expect ?? []).map((re) => [re, new RegExp(re).test(t)]);
          const bad = (step.forbid ?? []).map((re) => [re, new RegExp(re, 'i').test(t)]);
          console.log(`TEXTO ${block.role} ${step.text}: espera ${JSON.stringify(hits)} prohíbe ${JSON.stringify(bad)}`);
          registro.push({ rol: block.role, text: step.text, expect: hits, forbid: bad });
        }
        else if (step.download) {
          const before = new Set(readdirSync(dlDir));
          await clickText(page, new RegExp(step.download));
          let file = null;
          for (let i = 0; i < 40 && !file; i++) { await sleep(500); file = readdirSync(dlDir).find((f) => !before.has(f) && !f.endsWith('.crdownload')); }
          if (file && step.as) renameSync(join(dlDir, file), join(dlDir, step.as));
          console.log(`DESCARGA ${block.role}: ${file ? (step.as ?? file) : 'ninguna'}`);
          registro.push({ rol: block.role, download: step.as ?? file ?? null });
        }
        else if (step.db) {
          const user = await db.user.findUnique({ where: { email: emailOf(step.user) }, include: { members: true } });
          if (step.db === 'deactivate' || step.db === 'activate') await db.member.update({ where: { id: user.members[0].id }, data: { isActive: step.db === 'activate' } });
          if (step.db === 'role') { await db.member.update({ where: { id: user.members[0].id }, data: { role: step.role } }); await db.user.update({ where: { id: user.id }, data: { role: step.role } }); }
          console.log(`BASE ${step.db} ${step.user} ${step.role ?? ''}`);
          registro.push({ rol: block.role, db: step.db, user: step.user, role: step.role ?? null, at: new Date().toISOString() });
        }
        else if (step.admin) {
          const A1 = await L.institutional('A1');
          const user = await db.user.findUnique({ where: { email: emailOf(step.user) } });
          const r = step.admin === 'deactivate'
            ? await L.call(A1, 'PATCH', `/users/${user.id}/deactivate`)
            : await L.call(A1, 'PATCH', `/users/${user.id}`, step.admin === 'role' ? { role: step.role } : { isActive: true });
          console.log(`ADMIN A1 ${step.admin} ${step.user} ${step.role ?? ''}: HTTP ${r.status}`);
          registro.push({ rol: 'A1 (API)', admin: step.admin, user: step.user, role: step.role ?? null, status: r.status, at: new Date().toISOString() });
        }
        else if (step.focus) {
          await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
          await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});
          await sleep(1500);
        }
        else if (step.escape) { await page.keyboard.press('Escape'); await sleep(800); }
        else if (step.url) { const u = mask(new URL(page.url()).pathname); console.log(`URL ${step.url}: ${u}`); registro.push({ rol: block.role, url: step.url, path: u }); }
        else if (step.probe) { const r = await page.evaluate(step.js); console.log(`SONDA ${step.probe}: ${JSON.stringify(r)}`); registro.push({ rol: block.role, probe: step.probe, result: r }); }
        else if (step.shot) await capture(page, step, block.role);
      } catch (e) {
        console.log(`AVISO ${block.role} ${JSON.stringify(step).slice(0, 120)}: ${String(e.message).slice(0, 160)}`);
        registro.push({ rol: block.role, aviso: JSON.stringify(step).slice(0, 120), error: String(e.message).slice(0, 160) });
      }
    }
    await page.browserContext().close();
  }
} finally {
  writeFileSync(indexFile, JSON.stringify(index, null, 1));
  writeFileSync(logFile, JSON.stringify(registro, null, 1));
  await browser.close();
  await db.$disconnect();
}
