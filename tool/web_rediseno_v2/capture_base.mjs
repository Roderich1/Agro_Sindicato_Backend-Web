/**
 * Copia de `_wt/WEB-DESIGN-INPUT/tool/web_design/capture.mjs` (rama docs/web-redesign-input 36931b4)
 * adaptada por la sesión BASE del rediseño v2 (2026-11-13): añade el ancho de portátil (1280), el
 * paso `viewport` (fija el ancho para interactuar en teléfono), `sizes` en `shot` y el paso `key`
 * (teclado, para capturar el foco visible), `measure` (desplazamiento horizontal) y los anchos
 * `zoom200` (720×450 a 2x, zoom al 200 %) y `tableta` (820), y `probe` (medida libre). Lo demás es igual.
 *
 * Capturas de la Web REAL (entorno AISLADO → API 3350, datos sintéticos) para el material de
 * rediseño. Edge sin interfaz. Contraseñas de un solo uso fijadas en la base aislada y nunca
 * impresas ni capturadas (el campo de contraseña se escribe y no se fotografía con texto).
 *   node capture.mjs <plan.mjs> <carpeta_capturas>
 * El plan exporta `default: [{ role, steps: [...] }]`. Pasos:
 *   { goto: '/ruta' }  { click: 'regex', in?: 'selector' }  { type: ['#sel', 'texto'] }  { select: ['#sel', 'regex'] }
 *   { wait: ms }  { waitFor: 'selector' }  { open: 'selector' } (abre <details>)  { scroll: 'selector' }
 *   { shot: 'carpeta/nombre', desc: '…', state?: '…', full?: false, mobile?: true }   captura escritorio (1440) y, si mobile, 390
 *   { simulate: { url: 'regex', status?: 500, delayMs?: 0, body?: {} } }  respuesta SIMULADA (el nombre lleva «SIMULADO»)
 *   { unsimulate: true }  { escape: true }
 * Escribe <carpeta>/_capturas.json con ruta, rol, descripción, estado y si es simulado.
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL (tool/etapa3/e3env.sh de ET2-BE).
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [planFile, outDirArg] = process.argv.slice(2);
const outDir = resolve(outDirArg);
const { WEB_URL = 'http://127.0.0.1:5175', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const backRequire = createRequire(join(BE_DIR, 'Back', 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const bcrypt = backRequire('bcrypt');
const dbUrl = (() => { const u = new URL(DEMO_PG_ADMIN_URL); u.pathname = '/agro_demo'; return u.toString(); })();
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = {
  admin: 'admin.demo@example.test',
  directiva: 'directiva.demo@example.test',
  suc: 'sucesora.pa@example.test',
  admin2: 'admin2.pa@example.test',
  resp: 'responsable.pa@example.test',
  agricultor: 'agricultor3.demo@example.test',
};
const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1280, height: 800 };
// Sólo el ancho: cambiar isMobile/hasTouch obliga a Puppeteer a recargar la página (y a renovar la sesión).
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };
// Zoom al 200 % de una ventana de 1440×900: 720×450 px CSS con deviceScaleFactor 2. Tableta: 820×1180.
const ZOOM200 = { width: 720, height: 450, deviceScaleFactor: 2 };
const TABLET = { width: 820, height: 1180 };
const VIEWPORTS = { escritorio: DESKTOP, portatil: LAPTOP, movil: MOBILE, zoom200: ZOOM200, tableta: TABLET };
const plan = (await import(pathToFileURL(resolve(planFile)).href)).default;
const indexFile = join(outDir, '_capturas.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 120000 });
let logins = 0;

async function login(role) {
  if (logins++ > 0) await sleep(20000); // límite de inicio de sesión del entorno (20/min)
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport(DESKTOP);
  await page.emulateTimezone('America/La_Paz');
  // Registro de las llamadas a la API desde antes de iniciar sesión (paso `apiLog`).
  page.apiCalls = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (u.pathname.startsWith('/api/')) page.apiCalls.push(`${req.method()} ${u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>')}`); });
  if (role === 'anon') return page;
  const password = randomBytes(18).toString('base64url');
  await db.user.update({ where: { email: EMAIL[role] }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', EMAIL[role]);
  await page.type('#password', password);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  await sleep(1500);
  return page;
}

async function clickText(page, re, scope = 'body') {
  const handles = await page.$$(`${scope} button, ${scope} a, ${scope} summary, ${scope} [role="tab"], ${scope} label, ${scope} [role="button"]`);
  for (const h of handles) {
    const t = await h.evaluate((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim());
    const visible = await h.evaluate((e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    if (visible && re.test(t) && !(await h.evaluate((e) => e.disabled))) { await h.click(); await sleep(1500); return t; }
  }
  throw new Error(`sin elemento ${re} en ${scope}`);
}

let simulation = null;
async function capture(page, step, role) {
  if (role !== 'anon' && new URL(page.url()).pathname === '/login') throw new Error('no se captura: la sesión se perdió');
  const name = simulation ? `${step.shot}__SIMULADO` : step.shot;
  mkdirSync(dirname(join(outDir, name)), { recursive: true });
  const entries = [];
  // `sizes: ['actual']` captura sólo el ancho fijado con `viewport` (p. ej. el menú «Más» abierto).
  const sizes = step.sizes ?? ['escritorio', ...(step.mobile ? ['movil'] : [])];
  const current = page.currentViewport ?? 'escritorio';
  for (const label of sizes) {
    const real = label === 'actual' ? current : label;
    if (label !== 'actual' && real !== current) { await page.setViewport(VIEWPORTS[real]); await sleep(1500); }
    const file = `${name}__${real}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: step.full !== false });
    entries.push(file);
    if (label !== 'actual' && real !== current) { await page.setViewport(VIEWPORTS[current]); await sleep(800); }
  }
  const path = new URL(page.url()).pathname + new URL(page.url()).search;
  index.push({ files: entries, ruta: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>'), rol: role, desc: step.desc ?? '', estado: step.state ?? '', simulado: !!simulation });
  console.log(`captura ${entries.join(', ')}`);
}

try {
  for (const block of plan) {
    const page = await login(block.role);
    const apiCalls = page.apiCalls;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (simulation && new RegExp(simulation.url).test(req.url())) {
        const s = simulation;
        setTimeout(() => req.respond({ status: s.status ?? 500, contentType: 'application/json', body: JSON.stringify(s.body ?? { errorCode: 'INTERNAL_ERROR' }) }).catch(() => {}), s.delayMs ?? 0);
      } else req.continue().catch(() => {});
    });
    for (const step of block.steps) {
      try {
        if (step.goto) {
          // Navegación dentro de la aplicación (sin recargar): cada recarga renueva la sesión y el
          // entorno limita la autenticación a 20 por minuto. La primera visita sí carga la página.
          if (block.role === 'anon' || step.reload || !page.url().startsWith(WEB_URL)) {
            await page.goto(`${WEB_URL}${step.goto}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
          } else {
            await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, step.goto);
            await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
          }
          await sleep(step.after ?? 5000); // ritmo: el entorno limita la autenticación (20/min)
          if (block.role !== 'anon' && new URL(page.url()).pathname === '/login') throw new Error('la sesión se perdió (pantalla de inicio de sesión)');
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
        else if (step.apiLog) { console.log(`API ${block.role} ${step.apiLog}: ${JSON.stringify(apiCalls)}`); apiCalls.length = 0; }
        else if (step.inspect) {
          const info = await page.evaluate(() => ({
            path: location.pathname + location.search,
            dialogs: [...document.querySelectorAll('[role="dialog"], dialog[open]')].map((d) => (d.getAttribute('aria-label') || d.textContent || '').trim().slice(0, 80)),
            buttons: [...document.querySelectorAll('[role="dialog"] button')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 15),
            h1: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()).slice(0, 2),
            nav: document.querySelectorAll('nav').length,
            links: document.querySelectorAll('a[href]').length,
          }));
          console.log(`INSPECCIÓN ${step.inspect}: ${JSON.stringify(info)}`);
        }
        else if (step.escape) { await page.keyboard.press('Escape'); await sleep(800); }
        else if (step.probe) {
          // Medida libre en el navegador real (expresión JS que devuelve un objeto serializable).
          const r = await page.evaluate(step.js);
          console.log(`SONDA ${step.probe}: ${JSON.stringify(r)}`);
        }
        else if (step.measure) {
          // Desplazamiento horizontal de la página entera (COORDINACION §6): ancho del documento frente al de la ventana.
          const m = await page.evaluate(() => ({ path: location.pathname + location.search, doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
          console.log(`MEDIDA ${step.measure}: ${JSON.stringify(m)}${m.doc > m.win ? ' DESBORDA' : ' sin desplazamiento horizontal'}`);
        }
        else if (step.viewport) { page.currentViewport = step.viewport; await page.setViewport(VIEWPORTS[step.viewport]); await sleep(1500); }
        else if (step.key) { for (let i = 0; i < (step.times ?? 1); i++) { await page.keyboard.press(step.key); await sleep(150); } await sleep(400); }
        else if (step.simulate) simulation = step.simulate;
        else if (step.unsimulate) simulation = null;
        else if (step.shot) await capture(page, step, block.role);
      } catch (e) {
        console.log(`AVISO ${block.role} ${JSON.stringify(step).slice(0, 120)}: ${String(e.message).slice(0, 160)}`);
      }
    }
    simulation = null;
    await page.browserContext().close();
  }
} finally {
  writeFileSync(indexFile, JSON.stringify(index, null, 1));
  await browser.close();
  await db.$disconnect();
}
