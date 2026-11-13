/**
 * Sesión VERIFICACIÓN del rediseño Web v2 (2026-11-13). Copia de `capture_base.mjs` (BASE) con pasos
 * de comprobación añadidos; lo común (inicio de sesión de un solo uso, navegación con pushState,
 * capturas a 1440/390/zoom200, `simulate`) es igual. Contra la Web de revisión del orquestador
 * (WEB_URL, por defecto 5177 → API aislada 3350, datos sintéticos). Contraseñas de un solo uso fijadas
 * en la base aislada; nunca se imprimen ni se capturan.
 *   node verif_v.mjs <plan.mjs> <carpeta>
 * Además de los pasos de capture_base:
 *   { assert: 'etiqueta', js: '() => …' }      evalúa en la página y guarda el valor (no decide: registra)
 *   { apiLog: 'etiqueta' }                      guarda las llamadas /api desde el último apiLog (método, ruta, estado)
 *   { download: 'etiqueta', click?: 'regex', clickSel?: 'sel', in?: 'sel' }  descarga y guarda nombre, tamaño y cabecera
 *   { setValue: ['sel', 'valor'] }              valor de un input (p. ej. datetime-local) con eventos de React
 *   { selectByText: ['sel', 'regex'] }          elige la opción cuyo texto cumple la regex
 *   { mark: 'regex', in?: 'sel' }               marca (data-verif-opener) y pulsa el control: para comprobar el retorno del foco
 *   { focusInfo: 'etiqueta' }                   elemento enfocado, si está en un diálogo, si es el marcado y su anillo
 *   { tab: n, record: 'etiqueta' }              n pulsaciones de Tab registrando el foco de cada una
 *   { waitPath: 'regex' }                       espera a que la ruta cumpla la regex (30 s)
 * Escribe <carpeta>/_capturas.json (como capture_base) y <carpeta>/_verificacion.json (registro de pasos).
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL (tool/etapa3/e3env.sh de ET2-BE).
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [planFile, outDirArg] = process.argv.slice(2);
const outDir = resolve(outDirArg);
const { WEB_URL = 'http://127.0.0.1:5177', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL } = process.env;
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
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };
const ZOOM200 = { width: 720, height: 450, deviceScaleFactor: 2 };
const TABLET = { width: 820, height: 1180 };
const VIEWPORTS = { escritorio: DESKTOP, portatil: LAPTOP, movil: MOBILE, zoom200: ZOOM200, tableta: TABLET };
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const plan = (await import(pathToFileURL(resolve(planFile)).href)).default;
mkdirSync(outDir, { recursive: true });
const indexFile = join(outDir, '_capturas.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
const logFile = join(outDir, '_verificacion.json');
const runLog = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : [];
const run = { plan: basename(planFile), started: new Date().toISOString(), web: WEB_URL, entries: [] };
runLog.push(run);
const record = (entry) => { run.entries.push(entry); console.log(`${entry.kind.toUpperCase()} ${entry.role} ${entry.label ?? ''}: ${JSON.stringify(entry.value ?? entry.calls ?? entry.files ?? entry.error ?? '').slice(0, 600)}`); };
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 120000 });
let logins = 0;

async function login(role) {
  if (logins++ > 0) await sleep(20000); // límite de inicio de sesión del entorno (20/min)
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport(DESKTOP);
  await page.emulateTimezone('America/La_Paz');
  page.apiCalls = [];
  page.on('response', (res) => {
    const u = new URL(res.url());
    if (u.pathname.startsWith('/api/')) page.apiCalls.push(`${res.request().method()} ${u.pathname.replace(ID, '<id>')}${u.search ? u.search.replace(ID, '<id>') : ''} → ${res.status()}`);
  });
  page.on('requestfailed', (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith('/api/')) page.apiCalls.push(`${req.method()} ${u.pathname.replace(ID, '<id>')} → fallida`);
  });
  page.downloadDir = join(outDir, 'descargas');
  mkdirSync(page.downloadDir, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: page.downloadDir, browserContextId: context.id, eventsEnabled: true });
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

async function findText(page, re, scope = 'body') {
  const handles = await page.$$(`${scope} button, ${scope} a, ${scope} summary, ${scope} [role="tab"], ${scope} label, ${scope} [role="button"], ${scope} [role="menuitem"]`);
  for (const h of handles) {
    const t = await h.evaluate((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim());
    const visible = await h.evaluate((e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    if (visible && re.test(t) && !(await h.evaluate((e) => e.disabled))) return { h, t };
  }
  throw new Error(`sin elemento ${re} en ${scope}`);
}
async function clickText(page, re, scope = 'body') {
  const { h, t } = await findText(page, re, scope);
  await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await h.click();
  await sleep(1500);
  return t;
}

let simulation = null;
async function capture(page, step, role) {
  if (role !== 'anon' && new URL(page.url()).pathname === '/login' && !step.allowLogin) throw new Error('no se captura: la sesión se perdió');
  const name = simulation ? `${step.shot}__SIMULADO` : step.shot;
  mkdirSync(dirname(join(outDir, name)), { recursive: true });
  const entries = [];
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
  index.push({ files: entries, ruta: path.replace(ID, '<id>'), rol: role, desc: step.desc ?? '', estado: step.state ?? '', simulado: !!simulation });
  record({ kind: 'captura', role, label: step.shot, files: entries });
}

function head(file, n = 4) { const fd = openSync(file, 'r'); const b = Buffer.alloc(n); readSync(fd, b, 0, n, 0); closeSync(fd); return b; }

const FOCUS_JS = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body' };
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 70),
    inDialog: !!el.closest('[role="dialog"], [role="alertdialog"]'),
    isOpener: el.hasAttribute('data-verif-opener'),
    focusVisible: el.matches(':focus-visible'),
    ring: { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 80) },
    dialogs: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
  };
};

try {
  for (const block of plan) {
    const page = await login(block.role);
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
          if (block.role === 'anon' || step.reload || !page.url().startsWith(WEB_URL)) {
            await page.goto(`${WEB_URL}${step.goto}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
          } else {
            await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, step.goto);
            await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
          }
          await sleep(step.after ?? 4000);
          if (block.role !== 'anon' && !step.allowLogin && new URL(page.url()).pathname === '/login') throw new Error('la sesión se perdió (pantalla de inicio de sesión)');
        }
        else if (step.click) await clickText(page, new RegExp(step.click), step.in ?? 'body');
        else if (step.mark !== undefined || step.markSel) {
          await page.evaluate(() => document.querySelectorAll('[data-verif-opener]').forEach((e) => e.removeAttribute('data-verif-opener')));
          const { h, t } = step.markSel ? { h: await page.$(step.markSel) ?? (() => { throw new Error(`sin ${step.markSel}`); })(), t: step.markSel } : await findText(page, new RegExp(step.mark), step.in ?? 'body');
          await h.evaluate((e) => { e.setAttribute('data-verif-opener', ''); e.scrollIntoView({ block: 'center' }); e.focus(); });
          await page.keyboard.press(step.withKey ?? 'Enter');
          await sleep(1500);
          record({ kind: 'marca', role: block.role, label: t });
        }
        else if (step.clickSel) { await page.$eval(step.clickSel, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); }); await sleep(1500); }
        else if (step.check) { const boxes = await page.$$(step.check); await boxes[boxes.length - 1].click(); await sleep(500); }
        else if (step.type) { await page.click(step.type[0], { clickCount: 3 }); await page.type(step.type[0], step.type[1]); await sleep(500); }
        else if (step.setValue) {
          await page.$eval(step.setValue[0], (el, v) => {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, step.setValue[1]);
          await sleep(500);
        }
        else if (step.select || step.selectByText) {
          const [sel, src] = step.select ?? step.selectByText;
          const value = await page.$$eval(`${sel} option`, (opts, s) => opts.find((o) => new RegExp(s).test(o.textContent ?? ''))?.value ?? null, src);
          if (value === null) throw new Error(`sin opción ${src} en ${sel}`);
          await page.select(sel, value); await sleep(1200);
        }
        else if (step.wait) await sleep(step.wait);
        else if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 20000 });
        else if (step.waitPath) { await page.waitForFunction((s) => new RegExp(s).test(location.pathname + location.search), { timeout: 30000 }, step.waitPath); await sleep(1500); }
        else if (step.open) { await page.$$eval(step.open, (els) => els.forEach((e) => { e.open = true; })); await sleep(800); }
        else if (step.scroll) { await page.$eval(step.scroll, (e) => e.scrollIntoView({ block: 'start' })); await sleep(600); }
        else if (step.apiLog) { record({ kind: 'api', role: block.role, label: step.apiLog, calls: [...page.apiCalls] }); page.apiCalls.length = 0; }
        else if (step.assert) {
          const value = await page.evaluate(`(${step.js})()`);
          record({ kind: 'assert', role: block.role, label: step.assert, value });
        }
        else if (step.focusInfo) record({ kind: 'foco', role: block.role, label: step.focusInfo, value: await page.evaluate(FOCUS_JS) });
        else if (step.tab) {
          const seq = [];
          for (let i = 0; i < step.tab; i++) { await page.keyboard.press(step.shift ? 'Shift+Tab' : 'Tab'); await sleep(200); const f = await page.evaluate(FOCUS_JS); seq.push(`${f.tag}:${f.text}|fv=${f.focusVisible}|${f.ring?.outline}|${f.ring?.boxShadow === 'none' ? 'sin sombra' : 'sombra'}`); }
          record({ kind: 'tab', role: block.role, label: step.record ?? `tab×${step.tab}`, value: seq });
        }
        else if (step.download) {
          const before = new Set(readdirSync(page.downloadDir));
          if (step.clickSel) await page.$eval(step.clickSel, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); });
          else await clickText(page, new RegExp(step.click ?? 'Descargar Excel'), step.in ?? 'body');
          let file = null;
          for (let i = 0; i < 40 && !file; i++) {
            await sleep(500);
            file = readdirSync(page.downloadDir).find((f) => !before.has(f) && !f.endsWith('.crdownload')) ?? null;
          }
          if (!file) record({ kind: 'descarga', role: block.role, label: step.download, error: 'sin archivo descargado en 20 s' });
          else {
            const p = join(page.downloadDir, file);
            await sleep(500);
            record({ kind: 'descarga', role: block.role, label: step.download, value: { file, bytes: statSync(p).size, magic: head(p).toString('hex') } });
          }
        }
        else if (step.inspect) {
          const info = await page.evaluate(() => ({
            path: location.pathname + location.search,
            dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')].map((d) => (d.getAttribute('aria-label') || d.textContent || '').trim().slice(0, 120)),
            buttons: [...document.querySelectorAll('[role="dialog"] button')].map((b) => `${(b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()}${b.disabled ? ' [desactivado]' : ''}`).slice(0, 15),
            h1: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()).slice(0, 2),
          }));
          record({ kind: 'inspeccion', role: block.role, label: step.inspect, value: info });
        }
        else if (step.escape) { await page.keyboard.press('Escape'); await sleep(800); }
        else if (step.probe) record({ kind: 'sonda', role: block.role, label: step.probe, value: await page.evaluate(step.js) });
        else if (step.measure) {
          const m = await page.evaluate(() => ({ path: location.pathname + location.search, doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }));
          record({ kind: 'medida', role: block.role, label: step.measure, value: { ...m, path: m.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>'), desborda: m.doc > m.win } });
        }
        else if (step.viewport) { page.currentViewport = step.viewport; await page.setViewport(VIEWPORTS[step.viewport]); await sleep(1500); }
        else if (step.key) { for (let i = 0; i < (step.times ?? 1); i++) { await page.keyboard.press(step.key); await sleep(150); } await sleep(400); }
        else if (step.simulate) simulation = step.simulate;
        else if (step.unsimulate) simulation = null;
        else if (step.shot) await capture(page, step, block.role);
      } catch (e) {
        record({ kind: 'aviso', role: block.role, label: JSON.stringify(step).slice(0, 140), error: String(e.message).slice(0, 200) });
      }
    }
    simulation = null;
    await page.browserContext().close();
  }
} finally {
  run.finished = new Date().toISOString();
  writeFileSync(indexFile, JSON.stringify(index, null, 1));
  writeFileSync(logFile, JSON.stringify(runLog, null, 1));
  await browser.close();
  await db.$disconnect();
}
